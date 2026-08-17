import { createWorkersAI } from "workers-ai-provider";
import { generateText, isStepCount, convertToModelMessages } from "ai";
import { z } from "zod";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { RPC, type Env, type Package, type PlaceSuggestion } from "../rpc";
import { tenantFor } from "../directory";
import { mintProfileToken } from "../links/profile";
import type { WriteOp, SessionMessageView } from "../tenant";

// Dara's tool surface, built on @cloudflare/codemode: the model writes one
// JavaScript snippet that calls a typed `codemode` object, executed in an
// isolated Worker (Worker Loader, no filesystem, no outbound fetch) rather
// than making individual tool calls. Type definitions for whichever tools
// this session has are generated from the Zod schemas below -- no hand
// -maintained prompt string to drift out of sync with the real tool set,
// which is what caused the stale-schema bug this replaces.

// Must be a model with real function-calling support -- confirmed live,
// qwen2.5-coder (this project's original model, excellent at writing code in
// plain text) does not have it and never produces a genuine structured tool
// call through this provider, budget or no budget. glm-4.7-flash does, is
// priced per-token with no Workers-Paid-plan gate (unlike e.g. kimi-k2.7-code,
// the model Cloudflare's own tool-calling example uses), and recovers
// correctly from a thrown tool error by rereading it and retrying.
const MODEL = "@cf/zai-org/glm-4.7-flash";

// Where a link built server-side (no browser, so no window.location) points.
// Falls back to production; .dev.vars overrides it to the local client.
function profileUrl(env: Env, customerId: string, token: string): string {
  const base = env.APP_URL ?? "https://smtncargo.com";
  return `${base}/profile?c=${encodeURIComponent(customerId)}&t=${encodeURIComponent(token)}`;
}

const SCHEMA_DOC = `SQLite schema (timestamps are epoch milliseconds):
- customers(id, name, phone, email, address, address_place_id, onboarded_at, created_at) -- onboarded_at is null until they've filled in the profile form
- shipments(id, title, status, departs_at, arrives_at, created_at) -- status is 'open'|'sailed'|'arrived'|'clearing'|'released'
- orders(id, customer_id -> customers.id, shipment_id -> shipments.id, to_place, to_place_id, from_place, from_place_id, amount_total, amount_paid, clearance, created_at)
- packages(id, order_id -> orders.id, number, weight, length, width, height)
- messages(id, customer_id -> customers.id, sid, direction, body, from_addr, to_addr, actor, channel, created_at) -- read only; actor is 'dara'|'operator'|'customer', channel is 'sms'|'whatsapp'
- events(id, type, actor, summary, payload, status, customer_id, order_id, shipment_id, handled_at, created_at) -- read only

Join and aggregate freely; it is ordinary SQLite.`;

const placeSchema = z.object({
  description: z.string(),
  placeId: z.string(),
  structuredFormatting: z.object({
    mainText: z.string(),
    secondaryText: z.string(),
    mainTextMatchedSubstrings: z.array(
      z.object({ length: z.number(), offset: z.number() }),
    ),
  }),
});

const packageSchema = z.object({
  weight: z.number().nullish(),
  length: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

const writeOpSchema = z.object({
  table: z.enum(["shipments", "orders", "packages", "customers"]),
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
});

// One session, one set of trust flags, fixed for the whole run -- the same
// boundary DaraTools enforced, just closed over by these functions instead
// of gated inside class methods. Nothing here is reachable from generated
// code; only the *effects* of calling a tool are (a thrown error, a real
// send, a real write).
interface Session {
  env: Env;
  ctx: ExecutionContext;
  orgId: string;
  canSend: boolean;
  canWrite: boolean;
  customerId?: string;
}

type ToolDef = {
  description: string;
  inputSchema: z.ZodType;
  // `any`, not `unknown`: each tool's own execute below is typed to its own
  // Zod-inferred shape (narrower than this), which only typechecks against a
  // common record type through any's bidirectional compatibility. The real
  // contract is enforced at the boundary that matters -- createCodeTool
  // validates every call against inputSchema before execute ever runs.
  execute: (args: any) => Promise<unknown>;
};

// Which tools exist in the generated type block is which tools are *present*
// on this object -- sendMessage/write/whoAmI are omitted entirely for a
// session that can't use them, not just gated at call time. A read-only SMS
// session's prompt never even mentions them, the same defense-in-depth the
// old prompt-string curation gave, but derived from the same source of truth
// the sandbox actually enforces instead of a second hand-written copy of it.
function buildTools(session: Session): Record<string, ToolDef> {
  const { env, ctx, orgId, canSend, canWrite, customerId } = session;
  const rpc = () => new RPC(env, ctx);
  const db = () => tenantFor(env, orgId);

  const tools: Record<string, ToolDef> = {
    getPlaceSuggestions: {
      description: "Address autocomplete for a typed address.",
      inputSchema: z.object({ input: z.string() }),
      execute: async ({ input }: { input: string }) =>
        rpc().getPlaceSuggestions(input),
    },

    getProducts: {
      description:
        "Cheapest shipping quote for a route and package set; amount is in cents.",
      inputSchema: z.object({
        place: placeSchema,
        office: placeSchema,
        packages: z.array(packageSchema),
      }),
      execute: async ({
        place,
        office,
        packages,
      }: {
        place: PlaceSuggestion;
        office: PlaceSuggestion;
        packages: Package[];
      }) => rpc().getProducts(place, office, packages),
    },

    query: {
      description: `One read-only SELECT against SMTN's SQLite database. Use ? placeholders in sql and pass values via params -- never concatenate them into the string. No semicolons, one statement per call.\n\n${SCHEMA_DOC}`,
      inputSchema: z.object({
        sql: z.string(),
        params: z.array(z.unknown()).optional(),
      }),
      execute: async ({
        sql,
        params,
      }: {
        sql: string;
        params?: unknown[];
      }) => db().select(sql, ...(params ?? [])),
    },

    // Safe to expose even in a read-only SMS session: it only derives a
    // token, it doesn't send anything -- Dara puts the URL in its reply
    // text, and the trusted caller outside the sandbox sends that. An
    // explicit customerId is only honored when canWrite is set (the general
    // operator-task session); an SMS session always mints for its own bound
    // customer regardless of what a generated -- possibly injected --
    // argument asks for, so a malicious inbound text can't make Dara hand
    // back a different customer's profile link.
    createProfileLink: {
      description: `A link to the customer profile form (name, email, delivery address) for the given customer.
Never invent a customerId or a phone number -- one you made up, copied from an example, or guessed is not a real row, and minting a link for it produces a link that looks real but 404s the moment anyone opens it. Use only a phone number you were actually given (by the task, or by whoever is texting). If the task doesn't name a customer and none is bound to this session, don't guess -- say you need to know which customer first.
Retyping a URL from memory in a later message corrupts it (wrong domain, dropped token) -- build the complete reply in the same script that calls this, using the exact url string this returns, and return that finished reply as the script's result. Example: return \`Here's the link: \${url}\`;`,
      inputSchema: z.object({ customerId: z.string().optional() }),
      execute: async ({ customerId: explicitId }: { customerId?: string }) => {
        const id = canWrite ? (explicitId ?? customerId) : customerId;
        if (!id) throw new Error("createProfileLink needs a customerId");
        const token = await mintProfileToken(env, orgId, id);
        return { url: profileUrl(env, id, token) };
      },
    },

    // Same explicit-id-only-when-canWrite pattern as createProfileLink, so a
    // read-only SMS session can't read or overwrite a different customer's
    // notes via an injected argument.
    getMemory: {
      description:
        "Notes saved about this customer in an earlier conversation, if any.",
      inputSchema: z.object({ customerId: z.string().optional() }),
      execute: async ({ customerId: explicitId }: { customerId?: string }) => {
        const id = canWrite ? (explicitId ?? customerId) : customerId;
        if (!id) throw new Error("getMemory needs a customerId");
        return { memory: await db().getMemory(id) };
      },
    },

    setMemory: {
      description:
        "Save a short note about this customer for future conversations to see automatically -- a stated preference, an ongoing issue, something sensitive to handle carefully. One or two sentences, not a transcript.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        content: z.string(),
      }),
      execute: async ({
        customerId: explicitId,
        content,
      }: {
        customerId?: string;
        content: string;
      }) => {
        const id = canWrite ? (explicitId ?? customerId) : customerId;
        if (!id) throw new Error("setMemory needs a customerId");
        await db().setMemory(id, content);
        return { ok: true };
      },
    },
  };

  // The id of the customer currently texting, in an SMS session -- lets
  // generated code scope its own query() calls (e.g. this customer's older
  // messages, past the last-few-messages window it's shown) without being
  // handed the phone number as free text to parse out of the transcript.
  if (customerId) {
    tools.whoAmI = {
      description:
        "The id of the customer currently texting, for scoping your own query() calls to their history.",
      inputSchema: z.object({}),
      execute: async () => ({ customerId }),
    };
  }

  if (canSend) {
    tools.sendMessage = {
      description: "SMS each recipient; 'to' is an E.164 phone number.",
      inputSchema: z.object({
        messages: z.array(z.object({ to: z.string(), body: z.string() })),
      }),
      execute: async ({
        messages,
      }: {
        messages: { to: string; body: string }[];
      }) => rpc().sendMessage(messages),
    };
  }

  if (canWrite) {
    tools.write = {
      description: `Create or update rows (no deletes). Each op: { table, id, data }. Writing an id that already exists updates only the columns you pass. Generate new ids with crypto.randomUUID(). Relationships are plain foreign key columns, not links.
Example -- create an order with one package for a possibly-new customer in a shipment:
  const existing = await codemode.query({ sql: "SELECT id FROM customers WHERE phone = ?", params: [phone] });
  const customerId = existing[0]?.id ?? crypto.randomUUID();
  const orderId = crypto.randomUUID();
  await codemode.write({ ops: [
    { table: "customers", id: customerId, data: { name: "Ada", phone } },
    { table: "orders", id: orderId, data: { customer_id: customerId, shipment_id: shipmentId } },
    { table: "packages", id: crypto.randomUUID(), data: { order_id: orderId, number: "1", weight: 10 } },
  ] });`,
      inputSchema: z.object({ ops: z.array(writeOpSchema) }),
      execute: async ({ ops }: { ops: WriteOp[] }) => db().write(ops),
    };
  }

  return tools;
}

const SYSTEM_INSTRUCTIONS = `You are Dara, the operations agent for SMTN Cargo (a Lagos <-> Toronto shipping company). Use the codemode tool to look up data and take action -- call it as many times as you need, chaining lookups and writes in one script rather than guessing. When you're done, reply in plain text with what you found or did.`;

const SMS_INSTRUCTIONS = `You are Dara, the SMS assistant for SMTN Cargo (a Lagos <-> Toronto shipping company). A customer texted our number; use the codemode tool to look up whatever their message needs, then reply.
- Reply as a plain string: friendly, concise, plain text (no markdown), under 400 characters.
- If the request is unclear or beyond shipping matters, say a team member will follow up.
- The conversation shown to you is only the last few messages. If you need more of this customer's history (older messages, past orders), call whoAmI to get their customerId and query with it.
- If this customer looks new -- no name or email on file, or they ask to sign up -- call createProfileLink (no argument needed; it always targets whoever is texting). Build the full reply around its exact url in the same script and return that as your reply -- see createProfileLink's own description for why.
- If you learn something worth remembering for next time (a stated preference, an ongoing issue, something sensitive to handle carefully), call setMemory to save a short note. What you already know about this customer, if anything, is included below.`;

async function run(
  session: Session,
  system: string,
  input: { prompt: string } | { messages: SessionMessageView[] },
  maxSteps: number,
) {
  const executor = new DynamicWorkerExecutor({ loader: session.env.LOADER });
  const workersai = createWorkersAI({ binding: session.env.AI });
  const codemode = createCodeTool({ tools: buildTools(session), executor });

  // SessionMessageView (tenant.ts) is a narrowed copy of the Agents SDK's
  // own SessionMessage, which is documented as structurally compatible with
  // the AI SDK's UIMessage (id/role/parts) but isn't the same nominal type
  // -- hence the cast, same class of gap as MODEL's cast below.
  const promptOrMessages =
    "messages" in input
      ? { messages: await convertToModelMessages(input.messages as never) }
      : { prompt: input.prompt };

  return generateText({
    // workers-ai-provider's model-id union lags Workers AI's actual catalog
    // (doesn't export the type to narrow against, either) -- this id is the
    // one already verified live against env.AI.run() throughout this project.
    model: workersai(MODEL as Parameters<typeof workersai>[0]),
    system,
    tools: { codemode },
    // A step here is one tool call, not one full attempt like the old
    // generate()'s "2 attempts" -- a real task (resolve identity, query, hit
    // a schema error, reread it and retry, then reply) genuinely spans 3-4
    // steps. Too tight a budget doesn't fail cleanly: cut off mid-task, the
    // model's forced final turn tends to be a mangled restatement of the
    // tool call it didn't get to finish, not a clean error.
    stopWhen: isStepCount(maxSteps),
    ...promptOrMessages,
  });
}

export async function dara(
  env: Env,
  ctx: ExecutionContext,
  orgId: string,
  task: string,
): Promise<{ ok: true; text: string; steps: number } | { ok: false; error: string }> {
  try {
    const result = await run(
      { env, ctx, orgId, canSend: true, canWrite: true },
      SYSTEM_INSTRUCTIONS,
      { prompt: task },
      4,
    );
    return { ok: true, text: result.text, steps: result.steps.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read-only session: the caller sends the single reply to the sender, so an
// injected text can't make Dara message anyone else.
//
// Returns the whole outcome rather than just the reply: a failure here means a
// customer texted and got nothing back, which is the single most important
// thing for the operator inbox to surface. The caller logs it.
export async function daraSms(
  env: Env,
  ctx: ExecutionContext,
  orgId: string,
  messages: SessionMessageView[],
  customerId: string,
): Promise<{ reply: string | null; ok: boolean; steps?: number; error?: string }> {
  try {
    // Seeded up front so Dara sees it passively, without having to remember
    // to call getMemory every turn -- getMemory stays available too, mainly
    // for the general ops session where the customerId isn't known until
    // partway through a script.
    const memory = await tenantFor(env, orgId).getMemory(customerId);
    const system = memory
      ? `${SMS_INSTRUCTIONS}\n\nWhat you've noted about this customer before: ${memory}`
      : SMS_INSTRUCTIONS;
    const result = await run(
      { env, ctx, orgId, canSend: false, canWrite: false, customerId },
      system,
      { messages },
      4,
    );
    // The model usually closes with its own text turn, but createProfileLink
    // asks it to return the finished reply directly from the script instead
    // of retyping an exact url in a separate turn -- when that happens,
    // result.text is empty and the actual reply is the last tool's string
    // result. Prefer the model's own text when it wrote one.
    const lastResult = result.toolResults.at(-1)?.output;
    const lastToolText =
      lastResult && typeof lastResult === "object" && "result" in lastResult &&
        typeof lastResult.result === "string"
        ? lastResult.result
        : null;
    const reply = (result.text.trim() || lastToolText || "").trim().slice(0, 450);
    return { reply: reply || null, ok: true, steps: result.steps.length };
  } catch (error) {
    return {
      reply: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
