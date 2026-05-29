import { RpcTarget, newWorkersRpcResponse } from "capnweb";
import { generateText, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import {
  init,
  id,
  InstantAdminDatabase,
  InstantConfig
} from "@instantdb/admin";
import schema, { AppSchema, } from "../instant.schema";
import Stripe from "stripe";
import { calculateShipping } from "./shipping";

export interface Env {
  GOOGLE_MAPS_API_KEY: string;
  INSTANT_DB_ADMIN_TOKEN: string;
  INSTANT_DB_APP_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  AI: Ai;
  [key: string]: any;
}

export interface OrderMetadata {
  packages: {
    quantity: number;
    weight: number;
    height: number;
    width: number;
    length: number;
  }[];
  barrels: {
    small: number;
    large: number;
  };
  description: {
    description: string;
  };
  devices: {
    phones: number;
    consoles: number;
    laptops: number;
    tablets: number;
  };
  trip: {
    from: string;
    to: string;
    method: string;
    type: string;
  };
}

interface API {
  dara(message: string, chatId: string): Promise<string>;
  submit(deviceId: string, value: OrderMetadata): Promise<string | null>;
  getAvailableMethods(type: string, from: string, to: string): Promise<string[]>;
  getPlaceSuggestions(input: string): Promise<string[]>;
  removeTag(deviceId: string, orderId: string, tags: any): void;
}

class RPC extends RpcTarget implements API {
  private stripe: Stripe;
  private db: InstantAdminDatabase<AppSchema, false, InstantConfig<AppSchema, false>>;

  constructor(private env: Env, private ctx: ExecutionContext) {
    super();
    this.stripe = new Stripe(this.env.STRIPE_SECRET_KEY);
    this.db = init({ appId: this.env.INSTANT_DB_APP_ID, adminToken: this.env.INSTANT_DB_ADMIN_TOKEN, schema: schema });
  }

  async submit(deviceId: string, value: OrderMetadata) {

    const { devices } = await this.db.query({
      devices: {
        $: {
          where: {
            "id": deviceId,
          },
        },
        users: {},
      },
    });

    const user = devices[0]?.users;

    const session = await this.stripe.checkout.sessions.create({
      adaptive_pricing: {
        enabled: true,
      },
      allow_promotion_codes: true,
      client_reference_id: deviceId,
      customer_email: user?.email,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product: 'prod_TbmLGQbrCH7LTj',
            unit_amount: calculateShipping(value),
          },
          quantity: 1,
        },
      ],
      invoice_creation: {
        enabled: true,
      },
      phone_number_collection: {
        "enabled": true
      },
      mode: "payment",
      metadata: {
        value: JSON.stringify(value),
      },
      success_url: "https://smtncargo.com",
      cancel_url: "https://smtncargo.com",
    });

    return session.url || null;
  }

  async getAvailableMethods(type: string, from: string, to: string) {
    if (!from || !to) return [];
    switch (type) {
      case "dropoff":
        return ["air"];
      case "pickup":
        return ["air"];
      default:
        return [];
    }
  }

  async dara(message: string, chatId: string) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const model = workersai("@cf/meta/llama-3-8b-instruct", {});

    const { chats } = await this.db.query({
      chats: {
        $: {
          where: {
            "id": chatId,
          },
        },
      },
    });

    if (!chats[0]) {
      await this.db.transact(this.db.tx.chats[chatId].create({ messages: JSON.stringify([]) }))
    }

    const messages = JSON.parse(chats[0].messages).concat([{ role: "user" as const, content: message }]) as Array<{ role: 'user' | 'assistant' | 'system', content: string }>

    const tools = {
      codemode: {
        description: "Output your response in runnable typescript code only. Your response will then be run in a sandboxed runtime.",
        inputSchema: z.object({ code: z.string() }),
        execute: async ({ code }: { code: string }) => {
          return await this.env.LOADER.eval(code);
        },
      },
    };

    const system = `
      You are Dara. Smtn's assistant. Smtn is a freight forwarding company that operates mainly in the Nigerian Diaspora.
      Our offices are located in Toronto, Lagos, Montreal, Abuja and London.
    `

    const result = await generateText({
      model,
      system,
      messages,
      tools,
    });

    console.log(result);
    return "hi"
  }

  async getPlaceSuggestions(input: string) {
    console.log("Call getPlaceSuggestions", input);

    if (!input || input.length < 2) {
      return [];
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${this.env.GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === 'OK') {
        return data.predictions.map((prediction: any) => ({
          description: prediction.description,
          placeId: prediction.place_id,
        }));
      }

      return [];
    } catch (error) {
      console.error("Places API error:", error);
      return [];
    }
  }

  async removeTag(deviceId: string, orderId: string, tags: any) {
   await this.db.transact(this.db.tx.orders[orderId].update({ tags: tags }));
  }
}

// Webhook handler function
async function handleStripeWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const db = init({
    appId: env.INSTANT_DB_APP_ID,
    adminToken: env.INSTANT_DB_ADMIN_TOKEN,
    schema: schema
  });

  try {
    // Get the raw body
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature', { status: 400 });
    }

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Payment successful:', session.id);

        // Get the device ID from client_reference_id
        const deviceId = session.client_reference_id;

        console.log("Session", session)

        if (deviceId) {
          const { devices, users } = await db.query({
            devices: {
              $: {
                where: {
                  "id": deviceId,
                },
              },
              users: {},
            },
            users: {
              $: {
                where: {
                  "email": session.customer_details?.email || "",
                },
              },
            },
          });

          const userId = users[0]?.id || id()

          if (!users || !users[0]) {
            await db.transact(db.tx.users[userId].create({ phone: session.customer_details?.phone || "", email: session.customer_details?.email }))
          }

          //if (!devices || !devices[0]) {
            //await db.transact(db.tx.devices[deviceId].create({})).link({ users: userId })
         //}

          const metadata = JSON.parse(session.metadata?.value || '{}') as OrderMetadata;

          console.log(metadata)

          const orderId = id()

          const packages = metadata.packages.map((pkg, index) =>
            db.tx.packages[id()].create({
              quantity: pkg.quantity,
              weight: pkg.weight,
              height: pkg.height,
              width: pkg.width,
              length: pkg.length,
            }).link({ orders: orderId })
          )

          await db.transact([
            db.tx.devices[deviceId].link({ users: userId }),
            db.tx.orders[orderId].update({ amountTotal: session.amount_subtotal, amountPaid: session.amount_total, from: metadata.trip.from, to: metadata.trip.to, createdAt: new Date() }).link({ users: userId }),
            ...packages,
          ])

        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session expired:', session.id);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('PaymentIntent succeeded:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment failed:', paymentIntent.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Invoice payment succeeded:', invoice.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      `Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle webhook endpoint
    if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
      return handleStripeWebhook(request, env, ctx);
    }

    // Handle RPC requests
    return newWorkersRpcResponse(request, new RPC(env, ctx));
  },
};