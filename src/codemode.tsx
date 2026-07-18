import { RpcTarget } from "cloudflare:workers";
import { init } from "@instantdb/admin";
import schema from "../instant.schema";
import { RPC, type Env, type Package, type PlaceSuggestion } from "./rpc";
import { Lagos_Office, Toronto_Office } from "./offices";

// The capability handed to the sandbox. Uses #private fields so env/ctx/secrets
// are unreachable over RPC -- the sandbox can only call the public methods.
// canSend gates sendMessage: SMS sessions run read-only so an injected text
// can't make Dara message arbitrary numbers.
class DaraTools extends RpcTarget {
  #env: Env;
  #ctx: ExecutionContext;
  #canSend: boolean;

  constructor(env: Env, ctx: ExecutionContext, opts: { canSend?: boolean } = {}) {
    super();
    this.#env = env;
    this.#ctx = ctx;
    this.#canSend = opts.canSend ?? false;
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
    const db = init({
      appId: this.#env.INSTANT_DB_APP_ID,
      adminToken: this.#env.INSTANT_DB_ADMIN_TOKEN,
      schema,
    });
    return db.query(q as never);
  }
}

const READ_METHODS = `The api object (every method returns a Promise):

api.getOffices() -> { toronto: Place, lagos: Place } -- SMTN's two offices. Place = { description: string, placeId: string }.
api.getPlaceSuggestions(input: string) -> Place[] -- address autocomplete for a typed address.
api.getProducts(place: Place, office: Place, packages: { weight, length, width, height }[]) -> [{ name, provider, amount, currency, estimatedDays }] -- cheapest shipping quote, amount is in cents.
api.query(q) -> data -- read-only InstaQL query on SMTN's database.`;

const SEND_METHOD = `api.sendMessage(messages: { to: string, body: string }[]) -> { sent, failed } -- SMS each recipient; "to" is an E.164 phone number.`;

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

${SCHEMA_DOC}`;

const SMS_SYSTEM = `You are Dara, the SMS assistant for SMTN Cargo (a Lagos <-> Toronto shipping company). A customer texted our number; write JavaScript that looks up whatever their message needs and composes a reply.

${CODE_RULES}
- Return the reply as a plain string: friendly, concise, plain text (no markdown), under 400 characters.
- If the request is unclear or beyond shipping matters, return a short note that a team member will follow up.

${READ_METHODS}

${SCHEMA_DOC}`;

// Entry module for the sandboxed isolate; the generated code is mounted as task.js.
const HARNESS = `import { WorkerEntrypoint } from "cloudflare:workers";
import run from "./task.js";
export default class extends WorkerEntrypoint {
  async run() {
    try {
      return { ok: true, result: (await run(this.env.DARA)) ?? null };
    } catch (e) {
      return { ok: false, error: (e && e.stack) || String(e) };
    }
  }
}`;

type Outcome = { ok: true; result: unknown } | { ok: false; error: string };

interface Harness extends Rpc.WorkerEntrypointBranded {
  run(): Promise<Outcome>;
}

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

const extractCode = (text: string) =>
  /```(?:\w+)?\s*([\s\S]*?)```/.exec(text)?.[1].trim() ?? text.trim();

function runSandbox(
  env: Env,
  ctx: ExecutionContext,
  code: string,
  canSend: boolean,
) {
  const worker = env.LOADER.get(`dara-${crypto.randomUUID()}`, () => ({
    compatibilityDate: "2025-11-27",
    mainModule: "main.js",
    modules: { "main.js": HARNESS, "task.js": code },
    env: { DARA: new DaraTools(env, ctx, { canSend }) },
    // No network: the DARA binding is the sandbox's only capability.
    globalOutbound: null,
    limits: { cpuMs: 10_000, subRequests: 50 },
  }));
  return worker.getEntrypoint<Harness>().run() as Promise<Outcome>;
}

async function generate(
  env: Env,
  ctx: ExecutionContext,
  canSend: boolean,
  messages: { role: string; content: string }[],
) {
  let code = "";
  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await env.AI.run(MODEL, { messages, max_tokens: 4096 });
    const reply = String((res as { response?: unknown }).response ?? "");
    code = extractCode(reply);
    const outcome = await runSandbox(env, ctx, code, canSend);
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
  return generate(env, ctx, true, [
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
  const outcome = await generate(env, ctx, false, [
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
