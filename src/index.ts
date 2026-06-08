import { RpcTarget, newWorkersRpcResponse } from "capnweb";
import { generateText, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import {
  init,
  id,
  InstantAdminDatabase,
  InstantConfig,
} from "@instantdb/admin";
import schema, { AppSchema } from "../instant.schema";
import Stripe from "stripe";
import { Shippo, WeightUnitEnum, DistanceUnitEnum } from "shippo";
import { calculateShipping } from "./shipping";

export interface Env {
  GOOGLE_MAPS_API_KEY: string;
  INSTANT_DB_ADMIN_TOKEN: string;
  INSTANT_DB_APP_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SHIPPO_API_KEY: string;
  AI: Ai;
  [key: string]: any;
}

export interface Order {
  packages: {
    quantity: number;
    weight: number;
    height: number;
    width: number;
    length: number;
  }[];
  description: string;
  phones: number;
  consoles: number;
  laptops: number;
  tablets: number;
  from: string;
  to: string;
  paid: boolean;
}

interface PlaceSuggestion {
  description: string;
  placeId: string;
  structuredFormatting: {
    mainText: string;
    secondaryText: string;
    mainTextMatchedSubstrings: { length: number; offset: number }[];
  };
}

interface Package {
  weight: number;
  length: number;
  width: number;
  height: number;
}

interface ShippingProduct {
  id: string;
  name: string;
  provider: string;
  amount: number;
  currency: string;
  estimatedDays?: number;
  distanceText?: string;
  durationText?: string;
  providerImage75?: string;
  providerImage200?: string;
}

function extractCountryCode(description: string): string {
  const country = description.split(",").pop()?.trim() ?? "";
  const codes: Record<string, string> = {
    Canada: "CA",
    Nigeria: "NG",
    "United Kingdom": "GB",
    "United States": "US",
    France: "FR",
    Germany: "DE",
  };
  return codes[country] ?? "CA";
}

interface API {
  submit(value: Order): Promise<string | null>;
  getAvailableMethods(
    type: string,
    from: string,
    to: string,
  ): Promise<string[]>;
  getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]>;
  getProducts(place: PlaceSuggestion, office: PlaceSuggestion, packages: Package[]): Promise<ShippingProduct[]>;
}

class RPC extends RpcTarget implements API {
  private stripe: Stripe;
  private shippo: Shippo;
  private db: InstantAdminDatabase<
    AppSchema,
    false,
    InstantConfig<AppSchema, false>
  >;

  constructor(
    private env: Env,
    private ctx: ExecutionContext,
  ) {
    super();
    this.stripe = new Stripe(this.env.STRIPE_SECRET_KEY);
    this.shippo = new Shippo({ apiKeyHeader: this.env.SHIPPO_API_KEY });
    this.db = init({
      appId: this.env.INSTANT_DB_APP_ID,
      adminToken: this.env.INSTANT_DB_ADMIN_TOKEN,
      schema: schema,
    });
  }

  async submit(value: Order) {
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
            currency: "cad",
            product: "prod_TbmLGQbrCH7LTj",
            unit_amount: calculateShipping(value),
          },
          quantity: 1,
        },
      ],
      invoice_creation: {
        enabled: true,
      },
      phone_number_collection: {
        enabled: true,
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

  async getPlaceSuggestions(input: string) {
    if (!input || input.length < 2) return [];

    try {
      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.env.GOOGLE_MAPS_API_KEY,
        },
        body: JSON.stringify({ input }),
      });
      const data = (await response.json()) as any;

      return (data.suggestions ?? []).map((s: any) => {
        const p = s.placePrediction;
        return {
          description: p.text.text,
          placeId: p.placeId,
          structuredFormatting: {
            mainText: p.structuredFormat.mainText.text,
            secondaryText: p.structuredFormat.secondaryText.text,
            mainTextMatchedSubstrings: (p.structuredFormat.mainText.matches ?? []).map(
              (m: any) => ({ offset: m.startOffset ?? 0, length: m.endOffset - (m.startOffset ?? 0) })
            ),
          },
        };
      });
    } catch (error) {
      console.error("Places API error:", error);
      return [];
    }
  }

  async getProducts(place: PlaceSuggestion, office: PlaceSuggestion, packages: Package[]): Promise<ShippingProduct[]> {
    const shipments = await this.shippo.shipments.create({
      addressFrom: {
        name: "Smtn Office",
        street1: office.structuredFormatting.mainText,
        city: office.structuredFormatting.secondaryText.split(",")[0],
        country: extractCountryCode(office.description),
      },
      addressTo: {
        name: "Customer",
        street1: place.structuredFormatting.mainText,
        city: place.structuredFormatting.secondaryText.split(",")[0],
        country: extractCountryCode(place.description),
      },
      parcels: packages.map((p) => ({
        massUnit: WeightUnitEnum.Kg,
        weight: String(p.weight),
        distanceUnit: DistanceUnitEnum.In,
        length: String(p.length),
        width: String(p.width),
        height: String(p.height),
      })),
      async: false,
    });
  
    return (shipments.rates ?? []).map((rate) => ({
      id: rate.objectId,
      name: rate.servicelevel.name ?? rate.provider,
      provider: rate.provider,
      amount: Math.round(parseFloat(rate.amount) * 100),
      currency: rate.currency,
      estimatedDays: rate.estimatedDays ?? undefined,
      providerImage75: rate.providerImage75 ?? undefined,
      providerImage200: rate.providerImage200 ?? undefined,
    }));
  }

}

// Webhook handler function
async function handleStripeWebhook(
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
    // Get the raw body
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("No signature", { status: 400 });
    }

    // Verify the webhook signature
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

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Payment successful:", session.id);

        // Get the device ID from client_reference_id
        const deviceId = session.client_reference_id;

        console.log("Session", session);

        if (deviceId) {
          const { devices, users } = await db.query({
            devices: {
              $: {
                where: {
                  id: deviceId,
                },
              },
              users: {},
            },
            users: {
              $: {
                where: {
                  email: session.customer_details?.email || "",
                },
              },
            },
          });

          const userId = users[0]?.id || id();

          if (!users || !users[0]) {
            await db.transact(
              db.tx.users[userId].create({
                phone: session.customer_details?.phone || "",
                email: session.customer_details?.email,
              }),
            );
          }

          //if (!devices || !devices[0]) {
          //await db.transact(db.tx.devices[deviceId].create({})).link({ users: userId })
          //}

          const metadata = JSON.parse(
            session.metadata?.value || "{}",
          ) as Order;

          console.log(metadata);

          const orderId = id();

          const packages = metadata.packages.map((pkg, index) =>
            db.tx.packages[id()]
              .create({
                quantity: pkg.quantity,
                weight: pkg.weight,
                height: pkg.height,
                width: pkg.width,
                length: pkg.length,
              })
              .link({ orders: orderId }),
          );

          await db.transact([
            db.tx.devices[deviceId].link({ users: userId }),
            db.tx.orders[orderId]
              .update({
                amountTotal: session.amount_subtotal,
                amountPaid: session.amount_total,
                from: metadata.from,
                to: metadata.to,
                createdAt: new Date(),
              })
              .link({ users: userId }),
            ...packages,
          ]);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Checkout session expired:", session.id);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("PaymentIntent succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment failed:", paymentIntent.id);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Invoice payment succeeded:", invoice.id);
        break;
      }

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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle webhook endpoint
    if (url.pathname === "/webhook/stripe" && request.method === "POST") {
      return handleStripeWebhook(request, env, ctx);
    }

    // Handle RPC requests
    return newWorkersRpcResponse(request, new RPC(env, ctx));
  },
};
