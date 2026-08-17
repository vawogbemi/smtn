import Stripe from "stripe";
import twilio from "twilio";
import { RPC, type Env, type Order } from "./rpc";
import { daraSms } from "./agent/codemode";
import { tenantForNumber } from "./directory";
import type { TenantDO } from "./tenant";

// Runs in ctx.waitUntil after the webhook has already responded: builds the
// conversation history, asks Dara for a reply, texts it to the sender only,
// and records it so the thread stays complete.
async function replyWithDara(
  env: Env,
  ctx: ExecutionContext,
  opts: {
    from: string;
    to: string;
    orgId: string;
    tenant: DurableObjectStub<TenantDO>;
    customerId: string;
  },
) {
  try {
    // Scoped to this customer's thread via the Agents SDK Session API (kept
    // in sync with the messages table by recordMessage's write fan-out, see
    // tenant.ts). Labeled by actor at write time (so an operator's reply
    // doesn't read back to Dara as its own) and byte-budgeted on read,
    // replacing the old hand-rolled buildHistory(thread(...)) truncation.
    const messages = await opts.tenant.getSessionHistory(opts.customerId);

    const outcome = await daraSms(env, ctx, opts.orgId, messages, opts.customerId);

    // Both failure modes used to end here silently: the customer got no reply
    // and nobody found out. They are now the top of the operator inbox.
    if (!outcome.ok || !outcome.reply) {
      await opts.tenant.recordEvent({
        type: outcome.ok ? "agent.silent" : "agent.failed",
        actor: "dara",
        summary: outcome.ok
          ? `Dara produced no reply for ${opts.from}`
          : `Dara failed to answer ${opts.from}`,
        status: "needs_review",
        payload: { steps: outcome.steps, error: outcome.error },
        customerId: opts.customerId,
      });
      return;
    }

    const reply = outcome.reply;
    await new RPC(env, ctx).sendMessage([{ to: opts.from, body: reply }]);
    await opts.tenant.recordMessage({
      id: crypto.randomUUID(),
      customerId: opts.customerId,
      direction: "outbound",
      actor: "dara",
      body: reply,
      from: opts.to,
      to: opts.from,
    });
    await opts.tenant.recordEvent({
      type: "message.out",
      actor: "dara",
      summary: reply.slice(0, 140),
      payload: { steps: outcome.steps },
      customerId: opts.customerId,
    });
  } catch (error) {
    console.error("Dara SMS reply failed:", error);
    await opts.tenant
      .recordEvent({
        type: "agent.error",
        actor: "system",
        summary: `Dara reply threw for ${opts.from}`,
        status: "failed",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
        customerId: opts.customerId,
      })
      .catch((e) => console.error("Could not record agent.error:", e));
  }
}

export async function handleTwilioWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const signature = request.headers.get("x-twilio-signature");
    if (!signature) {
      return new Response("No signature", { status: 400 });
    }

    const params: Record<string, string> = {};
    (await request.formData()).forEach((value, key) => {
      params[key] = String(value);
    });

    if (
      !twilio.validateRequest(
        env.TWILIO_AUTH_TOKEN,
        signature,
        request.url,
        params,
      )
    ) {
      return new Response("Invalid signature", { status: 403 });
    }

    const sid = params.MessageSid || params.SmsSid;
    if (!sid) {
      return new Response("Not a message webhook", { status: 400 });
    }

    const from = params.From || "";
    const to = params.To || "";
    const body = params.Body || "";

    // Which forwarder owns the number the customer texted. An unclaimed number
    // is acked rather than errored -- Twilio would retry forever otherwise, and
    // there is no tenant whose inbox could show the problem.
    const owner = await tenantForNumber(env, to);
    if (!owner) {
      console.error(`No organization has claimed ${to}; dropping message`);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response/>',
        { headers: { "Content-Type": "text/xml" } },
      );
    }
    const { orgId, tenant } = owner;
    const customerId = await tenant.upsertCustomer(from);

    // Twilio retries deliveries; recordMessage reports the sid as already
    // stored, so we ack without duplicating it or replying twice.
    const isNew = await tenant.recordMessage({
      id: crypto.randomUUID(),
      sid,
      customerId,
      direction: "inbound",
      actor: "customer",
      body,
      from,
      to,
    });

    if (isNew) {
      await tenant.recordEvent({
        type: "message.in",
        actor: "customer",
        summary: body.slice(0, 140),
        customerId,
      });

      // Dara answers after the response goes out; Twilio only waits ~15s.
      ctx.waitUntil(
        replyWithDara(env, ctx, { from, to, orgId, tenant, customerId }),
      );
    }

    // Empty TwiML: acknowledge without sending an auto-reply.
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return new Response(
      `Webhook Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}

export async function handleStripeWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("No signature", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        `Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        { status: 400 },
      );
    }

    switch (event.type) {
      // FIXME: still a no-op -- a completed checkout creates no order. Unchanged
      // by the storage migration; it needs the booking flow fixed alongside it.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = JSON.parse(session.metadata?.value || "{}") as Order;
        console.warn("checkout.session.completed not handled", {
          sessionId: session.id,
          metadata,
        });
        break;
      }

      case "checkout.session.expired":
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "invoice.payment_succeeded":
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      `Webhook Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}
