import { RpcTarget } from "capnweb";
import {
  init,
  id,
  InstantAdminDatabase,
  InstantConfig,
  InstaQLEntity,
} from "@instantdb/admin";
import schema, { AppSchema } from "../instant.schema";
import Stripe from "stripe";
import { Shippo, WeightUnitEnum, DistanceUnitEnum } from "shippo";
import twilio from "twilio";
import { unzipSync } from "fflate";

const TWILIO_FROM_NUMBER = "+16479526586";

export interface Env {
  GOOGLE_MAPS_API_KEY: string;
  INSTANT_DB_ADMIN_TOKEN: string;
  INSTANT_DB_APP_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SHIPPO_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  AI: Ai;
  LOADER: WorkerLoader;
  [key: string]: any;
}

export type Order = InstaQLEntity<typeof schema, "orders">;

export type Package = InstaQLEntity<typeof schema, "packages">;

export interface PlaceSuggestion {
  description: string;
  placeId: string;
  structuredFormatting: {
    mainText: string;
    secondaryText: string;
    mainTextMatchedSubstrings: { length: number; offset: number }[];
  };
}

export interface ShippingProduct {
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

interface ShippingAddress {
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface API {
  submit(value: Order): Promise<string | null>;
  getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]>;
  getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ): Promise<ShippingProduct[]>;
  parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }): Promise<Package[]>;
  sendMessage(
    messages: { to: string; body: string }[],
  ): Promise<{ sent: number; failed: number }>;
}

export class RPC extends RpcTarget implements API {
  private stripe: Stripe;
  private shippo: Shippo;
  private _twilio?: ReturnType<typeof twilio>;
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
      adaptive_pricing: { enabled: true },
      allow_promotion_codes: true,
      client_reference_id: undefined,
      customer_email: undefined,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "cad",
            product: "prod_TbmLGQbrCH7LTj",
            unit_amount: 200,
          },
          quantity: 1,
        },
      ],
      invoice_creation: { enabled: true },
      phone_number_collection: { enabled: true },
      mode: "payment",
      metadata: { value: JSON.stringify(value) },
      success_url: "https://smtncargo.com",
      cancel_url: "https://smtncargo.com",
    });
    return session.url || null;
  }

  async getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
    if (!input || input.length < 2) return [];
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:ca|country:ng|country:gb&key=${this.env.GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;
      console.log(data);
      if (data.status === "OK") {
        return data.predictions.map((prediction: any) => ({
          description: prediction.description,
          placeId: prediction.place_id,
          structuredFormatting: {
            mainText: prediction.structured_formatting.main_text,
            secondaryText: prediction.structured_formatting.secondary_text,
            mainTextMatchedSubstrings:
              prediction.structured_formatting.main_text_matched_substrings,
          },
        }));
      }
      return [];
    } catch (error) {
      console.error("Places API error:", error);
      return [];
    }
  }

  private async getAddressFromPlaceId(
    placeId: string,
    apiKey: string,
  ): Promise<ShippingAddress> {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_component&key=${apiKey}`;
    const response = await fetch(url);
    const data = (await response.json()) as any;
    const components = (data.result?.address_components ?? []) as {
      long_name: string;
      short_name: string;
      types: string[];
    }[];

    const find = (type: string, useShortName = false) => {
      const component = components.find((c) => c.types.includes(type));
      return component
        ? useShortName
          ? component.short_name
          : component.long_name
        : "";
    };

    const streetNumber = find("street_number");
    const route = find("route");

    return {
      street1:
        [streetNumber, route].filter(Boolean).join(" ") ||
        find("premise") ||
        find("point_of_interest"),
      city: find("locality") || find("postal_town") || find("sublocality"),
      state: find("administrative_area_level_1", true),
      zip: find("postal_code"),
      country: find("country", true),
    };
  }

  private async getDistanceMeters(
    originPlaceId: string,
    destinationPlaceId: string,
    apiKey: string,
  ): Promise<number | null> {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=place_id:${encodeURIComponent(originPlaceId)}&destinations=place_id:${encodeURIComponent(destinationPlaceId)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = (await response.json()) as any;
    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status === "OK") {
      return element.distance.value as number;
    }
    return null;
  }

  async getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ): Promise<ShippingProduct[]> {
    const [fromAddress, toAddress, distanceMeters] = await Promise.all([
      this.getAddressFromPlaceId(office.placeId, this.env.GOOGLE_MAPS_API_KEY),
      this.getAddressFromPlaceId(place.placeId, this.env.GOOGLE_MAPS_API_KEY),
      this.getDistanceMeters(
        office.placeId,
        place.placeId,
        this.env.GOOGLE_MAPS_API_KEY,
      ),
    ]);
  
    const parcelIds = await Promise.all(
      packages.map(async (p) => {
        const parcel = await this.shippo.parcels.create({
          massUnit: WeightUnitEnum.Kg,
          weight: String(p.weight),
          distanceUnit: DistanceUnitEnum.Cm,
          length: String(p.length),
          width: String(p.width),
          height: String(p.height),
        });
        return parcel.objectId;
      }),
    );

    const shipments = await this.shippo.shipments.create({
      addressFrom: { name: "Smtn Office", ...fromAddress },
      addressTo: { name: "Customer", ...toAddress },
      parcels: parcelIds.filter((parcelId): parcelId is string =>
        Boolean(parcelId)
      ),
      async: false,
    });

    const products = (shipments.rates ?? [])
      .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))
      .map((rate) => ({
        id: rate.objectId,
        name: rate.servicelevel.name ?? rate.provider,
        provider: rate.provider,
        amount: Math.round(parseFloat(rate.amount) * 100),
        currency: rate.currency,
        estimatedDays: rate.estimatedDays ?? undefined,
        providerImage75: rate.providerImage75 ?? undefined,
        providerImage200: rate.providerImage200 ?? undefined,
      }));

    if (
      products.length > 0 &&
      distanceMeters !== null &&
      distanceMeters <= 25000
    ) {
      const cheapest = products[0];
      products.unshift({
        id: "smtn-delivery",
        name: "Delivery",
        provider: "Smtn",
        amount: Math.min(cheapest.amount, 4000),
        currency: cheapest.currency,
        estimatedDays: 3,
        providerImage75: "https://public.smtncargo.com/smtnlogo.png",
        providerImage200: "https://public.smtncargo.com/smtnlogo.png",
      });
    }

    let cheapest: ShippingProduct | null = null;
    for (const product of products) {
      if (product.id !== "smtn-delivery") {
        product.amount = Math.round(product.amount * 1.3);
      }
      if (
        !cheapest ||
        product.amount < cheapest.amount ||
        (product.amount === cheapest.amount &&
          (product.estimatedDays ?? Infinity) <
            (cheapest.estimatedDays ?? Infinity))
      ) {
        cheapest = product;
      }
    }

    return cheapest ? [cheapest] : [];
  }

  private extractFileText(
    file: { name: string; type: string },
    bytes: Uint8Array,
  ): string {
    const isDocx =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");

    if (isDocx) {
      const entries = unzipSync(bytes);
      const documentXml = entries["word/document.xml"];
      if (!documentXml) {
        throw new Error("Couldn't find document content inside the .docx file");
      }
      const xml = new TextDecoder("utf-8").decode(documentXml);
      // docx wraps paragraphs in <w:p>; insert newlines so paragraphs don't run together.
      return xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim()
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
          String.fromCharCode(parseInt(code, 16)),
        )
        .replace(/&amp;/g, "&");
    }

    const isSupportedText =
      file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".csv");
    if (!isSupportedText) {
      throw new Error(
        `Unsupported file type "${file.type || file.name}" — only CSV and DOCX are supported right now.`,
      );
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  async parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }): Promise<Package[]> {
    const binary = atob(file.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    console.log(bytes.length);
    const content = this.extractFileText(file, bytes);
    console.log(content);
    const response = await this.env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        prompt:
          `Extract every package/parcel listed in this shipment file and return them as JSON, add +country code to the beginning of phone numbers no space for example "+1xxxxxxxxxx", get name from consignee name, ignore value inbetween braces "[]" and also return null for the values you cant find.\n\n` +
          `File name: ${file.name}\n` +
          `File contents:\n${content}`,
        max_tokens: 16384,
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: {
              packages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    number: { type: ["string", "number"] },
                    name: { type: ["string"] },
                    length: { type: ["number", "null"] },
                    width: { type: ["number", "null"] },
                    height: { type: ["number", "null"] },
                    weight: { type: ["number", "null"] },
                    phone: { type: ["string", "null"] },
                  },
                  required: ["number", "name", "weight", "phone"],
                },
              },
            },
            required: ["packages"],
          },
        },
      },
    );

    const raw = (response as { response?: unknown }).response;
    // The model sometimes embeds raw control characters (e.g. literal newlines
    // copied from the source file) inside JSON string values, which breaks
    // strict JSON.parse. Escape control characters, but only while inside a
    // string literal -- structural whitespace between tokens must stay as-is.
    const sanitizeJson = (text: string) => {
      let result = "";
      let inString = false;
      let escaped = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        if (inString) {
          if (escaped) {
            result += ch;
            escaped = false;
          } else if (ch === "\\") {
            result += ch;
            escaped = true;
          } else if (ch === '"') {
            inString = false;
            result += ch;
          } else if (code === 10) {
            result += "\\n";
          } else if (code === 13) {
            result += "\\r";
          } else if (code === 9) {
            result += "\\t";
          } else {
            result += ch;
          }
        } else {
          if (ch === '"') inString = true;
          result += ch;
        }
      }
      return result;
    };
    const parsed =
      typeof raw === "string"
        ? JSON.parse(sanitizeJson(raw) || "{}")
        : (raw ?? {});
    const packages =
      (
        parsed as {
          packages?: (Package & {
            name?: string | null;
            phone?: string | null;
          })[];
        }
      ).packages ?? [];
    const toTitleCase = (name: string) =>
      name.replace(
        /\S+/g,
        (word) => word[0].toUpperCase() + word.slice(1).toLowerCase(),
      );
    const cleanPhone = (phone: string) => phone.replace(/[-\s]/g, "");
    return packages.map((pkg) => ({
      ...pkg,
      ...(pkg.name ? { name: toTitleCase(pkg.name) } : {}),
      ...(pkg.phone ? { phone: cleanPhone(pkg.phone) } : {}),
    }));
  }

  // Lazy: twilio() throws without credentials, so only sendMessage depends on them.
  private get twilio() {
    return (this._twilio ??= twilio(
      this.env.TWILIO_ACCOUNT_SID,
      this.env.TWILIO_AUTH_TOKEN,
    ));
  }

  async sendMessage(messages: { to: string; body: string }[]) {
    const results = await Promise.allSettled(
      messages.map((m) =>
        this.twilio.messages.create({
          to: m.to,
          from: TWILIO_FROM_NUMBER,
          body: m.body,
        })
      ),
    );
    for (const r of results) {
      if (r.status === "rejected") console.error("Twilio send failed:", r.reason);
    }
    const sent = results.filter((r) => r.status === "fulfilled").length;
    return { sent, failed: results.length - sent };
  }
}
