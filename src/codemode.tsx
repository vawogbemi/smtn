import { RpcTarget } from "cloudflare:workers";
import { init } from "@instantdb/admin";
import schema from "../instant.schema";
import { RPC, type Env, type Package, type PlaceSuggestion } from "./rpc";
import { Lagos_Office, Toronto_Office } from "./offices";

// Entities Dara may write to; keeps $users, $files, and messages off limits.
const WRITABLE = [
  "shipments",
  "orders",
  "packages",
  "customers",
  "orderFrom",
  "orderTo",
] as const;

interface WriteOp {
  entity: (typeof WRITABLE)[number];
  id: string;
  data?: Record<string, unknown>;
  link?: Record<string, string>;
}

// The capability handed to the sandbox. Uses #private fields so env/ctx/secrets
// are unreachable over RPC -- the sandbox can only call the public methods.
// canSend/canWrite gate the side-effecting methods: SMS sessions run read-only
// so an injected text can't message anyone or mutate the database.
class DaraTools extends RpcTarget {
  #env: Env;
  #ctx: ExecutionContext;
  #canSend: boolean;
  #canWrite: boolean;

  constructor(
    env: Env,
    ctx: ExecutionContext,
    opts: { canSend?: boolean; canWrite?: boolean } = {},
  ) {
    super();
    this.#env = env;
    this.#ctx = ctx;
    this.#canSend = opts.canSend ?? false;
    this.#canWrite = opts.canWrite ?? false;
  }

  #db() {
    return init({
      appId: this.#env.INSTANT_DB_APP_ID,
      adminToken: this.#env.INSTANT_DB_ADMIN_TOKEN,
      schema,
    });
  }

  #rpc() {
    return new RPC(this.#env, this.#ctx);
  }

  getOffices() {
    return { toronto: Toronto_Office, lagos: Lagos_Office };
  }

  getPlaceSuggestions(input: string) {
    return this.#rpc().getPlaceSuggestions(input);
  }

  getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ) {
    return this.#rpc().getProducts(place, office, packages);
  }

  sendMessage(messages: { to: string; body: string }[]) {
    if (!this.#canSend) {
      throw new Error("sendMessage is not available in this session");
    }
    return this.#rpc().sendMessage(messages);
  }

  query(q: Record<string, unknown>) {
    return this.#db().query(q as never);
  }

  write(ops: WriteOp[]) {
    if (!this.#canWrite) {
      throw new Error("write is not available in this session");
    }
    const db = this.#db();
    return db.transact(
      ops.map((op) => {
        if (!WRITABLE.includes(op.entity)) {
          throw new Error(`Cannot write to "${op.entity}"`);
        }
        const chunk = (db.tx[op.entity] as Record<string, any>)[op.id].update(
          op.data ?? {},
        );
        return op.link ? chunk.link(op.link) : chunk;
      }),
    );
  }
}

const READ_METHODS = `The api object (every method returns a Promise):

api.getOffices() -> { toronto: Place, lagos: Place } -- SMTN's two offices. Place = { description: string, placeId: string }.
api.getPlaceSuggestions(input: string) -> Place[] -- address autocomplete for a typed address.
api.getProducts(place: Place, office: Place, packages: { weight, length, width, height }[]) -> [{ name, provider, amount, currency, estimatedDays }] -- cheapest shipping quote, amount is in cents.
api.query(q) -> data -- read-only InstaQL query on SMTN's database.`;

const SEND_METHOD = `api.sendMessage(messages: { to: string, body: string }[]) -> { sent, failed } -- SMS each recipient; "to" is an E.164 phone number.`;

const WRITE_METHOD = `api.write(ops) -> transaction result -- create or update entities and their links (no deletes). Each op: { entity: "shipments"|"orders"|"packages"|"customers"|"orderFrom"|"orderTo", id: string, data?: object, link?: { label: id } }. Generate new ids with crypto.randomUUID(); writing to an existing id updates it.
Example -- create an order with one package for a possibly-new customer in a shipment:
  const phone = "+14165550123";
  const existing = (await api.query({ customers: { $: { where: { phone } } } })).customers[0];
  const customerId = existing?.id ?? crypto.randomUUID();
  const orderId = crypto.randomUUID();
  await api.write([
    { entity: "customers", id: customerId, data: { name: "Ada", phone } },
    { entity: "orders", id: orderId, data: { createdAt: Date.now() }, link: { customers: customerId, shipments: shipmentId } },
    { entity: "packages", id: crypto.randomUUID(), data: { number: "1", weight: 10 }, link: { orders: orderId } },
  ]);`;

const SCHEMA_DOC = `InstaQL: { entity: { linkedEntity: {}, $: { where: { field: value } } } } selects entities plus their linked entities.
Entities and links:
- shipments { title } -> orders (many)
- orders { createdAt } -> shipments, packages (many), customers (one), orderFrom (one), orderTo (one)
- packages { number, weight, length, width, height }
- customers { name, phone } -> messages (many)
- messages { body, direction, from, to, createdAt }
- orderFrom / orderTo { description, placeId }
Example: api.query({ shipments: { $: { where: { title: "Lagos June" } }, orders: { packages: {}, customers: {} } } })`;

const CODE_RULES = `Reply with exactly one \`\`\`js code block containing an ES module of the form:
export default async function run(api) { ... }

Rules:
- Plain JavaScript only: no TypeScript syntax, no imports, no fetch, no environment access.`;

const SYSTEM = `You are Dara, the operations agent for SMTN Cargo (a Lagos <-> Toronto shipping company). You complete tasks by writing JavaScript that runs in a sandbox where a provided \`api\` object is the only way to reach the outside world.

${CODE_RULES}
- Return a JSON-serializable value that answers the task, including the data you gathered.
- Loop over data in code instead of guessing values.

${READ_METHODS}
${SEND_METHOD}
${WRITE_METHOD}

${SCHEMA_DOC}`;

const SMS_SYSTEM = `You are Dara, the SMS assistant for SMTN Cargo (a Lagos <-> Toronto shipping company). A customer texted our number; write JavaScript that looks up whatever their message needs and composes a reply.

${CODE_RULES}
- Return the reply as a plain string: friendly, concise, plain text (no markdown), under 400 characters.
- If the request is unclear or beyond shipping matters, return a short note that a team member will follow up.

${READ_METHODS}

${SCHEMA_DOC}`;

// Entry module for the sandboxed isolate; the generated code is mounted as
// task.js. The api arrives as the run() argument because RPC targets can only
// be serialized inside an RPC call, not in the worker's env. The result is
// round-tripped through JSON *inside* the sandbox (same isolate, so it can
// never throw the cross-isolate DataCloneError) before it's handed back --
// generated code sometimes returns "api" itself or another live reference by
// mistake, and that can't cross the RPC boundary as ordinary data.
const HARNESS = `import { WorkerEntrypoint } from "cloudflare:workers";
import run from "./task.js";
export default class extends WorkerEntrypoint {
  async run(api) {
    let result;
    try {
      result = (await run(api)) ?? null;
    } catch (e) {
      return { ok: false, error: (e && e.stack) || String(e) };
    }
    try {
      return { ok: true, result: JSON.parse(JSON.stringify(result)) };
    } catch (e) {
      return {
        ok: false,
        error: "Your returned result isn't plain, JSON-serializable data (e.g. it embeds api or another live reference): " + ((e && e.message) || String(e)),
      };
    }
  }
}`;

type Outcome = { ok: true; result: unknown } | { ok: false; error: string };

interface Harness extends Rpc.WorkerEntrypointBranded {
  run(api: DaraTools): Promise<Outcome>;
}

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

const extractCode = (text: string) =>
  /```(?:\w+)?\s*([\s\S]*?)```/.exec(text)?.[1].trim() ?? text.trim();

type Caps = { canSend?: boolean; canWrite?: boolean };

// Always resolves to an Outcome -- never rejects -- so callers can rely on
// generate()'s retry loop instead of needing their own try/catch. Transport
// -level failures (timeouts, CPU-limit kills, anything the harness's own
// try/catch couldn't intercept) are converted the same way as script errors.
async function runSandbox(
  env: Env,
  ctx: ExecutionContext,
  code: string,
  caps: Caps,
): Promise<Outcome> {
  const worker = env.LOADER.get(`dara-${crypto.randomUUID()}`, () => ({
    compatibilityDate: "2025-11-27",
    mainModule: "main.js",
    modules: { "main.js": HARNESS, "task.js": code },
    // No network: the api passed into run() is the sandbox's only capability.
    globalOutbound: null,
    limits: { cpuMs: 10_000, subRequests: 50 },
  }));
  try {
    return await worker.getEntrypoint<Harness>().run(new DaraTools(env, ctx, caps));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e) };
  }
}

async function generate(
  env: Env,
  ctx: ExecutionContext,
  caps: Caps,
  messages: { role: string; content: string }[],
) {
  let code = "";
  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await env.AI.run(MODEL, { messages, max_tokens: 4096 });
    const reply = String((res as { response?: unknown }).response ?? "");
    code = extractCode(reply);
    const outcome = await runSandbox(env, ctx, code, caps);
    if (outcome.ok) {
      return { ok: true as const, result: outcome.result, code, attempt };
    }
    error = outcome.error;
    messages.push(
      { role: "assistant", content: reply },
      {
        role: "user",
        content: `That code threw:\n${error}\n\nReply with only the corrected js code block.`,
      },
    );
  }
  return { ok: false as const, error, code };
}

export function dara(env: Env, ctx: ExecutionContext, task: string) {
  return generate(env, ctx, { canSend: true, canWrite: true }, [
    { role: "system", content: SYSTEM },
    { role: "user", content: task },
  ]);
}

// Read-only session: the caller sends the single reply to the sender, so an
// injected text can't make Dara message anyone else.
export async function daraSms(
  env: Env,
  ctx: ExecutionContext,
  history: string,
) {
  const outcome = await generate(env, ctx, {}, [
    { role: "system", content: SMS_SYSTEM },
    { role: "user", content: history },
  ]);
  if (!outcome.ok) return null;
  const reply =
    typeof outcome.result === "string"
      ? outcome.result
      : JSON.stringify(outcome.result ?? "");
  return reply.trim().slice(0, 450) || null;
}
