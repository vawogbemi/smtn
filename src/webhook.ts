import { init, id, lookup } from "@instantdb/admin";
import schema from "../instant.schema";
import Stripe from "stripe";
import twilio from "twilio";
import { RPC, type Env, type Order } from "./rpc";
import { daraSms } from "./codemode";

// Runs in ctx.waitUntil after the webhook has already responded: builds the
// conversation history, asks Dara for a reply, texts it to the sender only,
// and records it so the thread stays complete.
async function replyWithDara(
  env: Env,
  ctx: ExecutionContext,
  opts: { from: string; to: string; customerId?: string },
) {
  const db = init({
    appId: env.INSTANT_DB_APP_ID,
    adminToken: env.INSTANT_DB_ADMIN_TOKEN,
    schema: schema,
  });

  try {
    const { messages } = await db.query({
      messages: {
        $: { where: { or: [{ from: opts.from }, { to: opts.from }] } },
      },
    });
    const history = messages
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime(),
      )
      .slice(-8)
      .map(
        (m) => `${m.direction === "inbound" ? "Customer" : "Dara"}: ${m.body ?? ""}`,
      )
      .join("\n");

    const reply = await daraSms(env, ctx, history);
    if (!reply) return;

    await new RPC(env, ctx).sendMessage([{ to: opts.from, body: reply }]);
    await db.transact(
      db.tx.messages[id()]
        .create({
          body: reply,
          from: opts.to,
          to: opts.from,
          direction: "outbound",
          createdAt: new Date(),
        })
        .link(opts.customerId ? { customers: opts.customerId } : {}),
    );
  } catch (error) {
    console.error("Dara SMS reply failed:", error);
  }
}

export async function handleTwilioWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const db = init({
    appId: env.INSTANT_DB_APP_ID,
    adminToken: env.INSTANT_DB_ADMIN_TOKEN,
    schema: schema,
  });

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

    const { customers } = await db.query({
      customers: { $: { where: { phone: params.From || "" } } },
    });
    const customer = customers[0];

    // Upsert by sid so Twilio's webhook retries stay idempotent.
    await db.transact(
      db.tx.messages[lookup("sid", sid)]
        .update({
          body: params.Body || "",
          from: params.From || "",
          to: params.To || "",
          direction: "inbound",
          createdAt: new Date(),
        })
        .link(customer ? { customers: customer.id } : {}),
    );

    // Dara answers after the response goes out; Twilio only waits ~15s.
    ctx.waitUntil(
      replyWithDara(env, ctx, {
        from: params.From || "",
        to: params.To || "",
        customerId: customer?.id,
      }),
    );

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
  const db = init({
    appId: env.INSTANT_DB_APP_ID,
    adminToken: env.INSTANT_DB_ADMIN_TOKEN,
    schema: schema,
  });

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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const deviceId = session.client_reference_id;
        const metadata = JSON.parse(session.metadata?.value || "{}") as Order;
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
