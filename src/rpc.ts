import { RpcTarget } from "capnweb";
import Stripe from "stripe";
import { Shippo, WeightUnitEnum, DistanceUnitEnum } from "shippo";
import twilio from "twilio";
import { parseManifest } from "./manifest-parser";
import { registry, tenantFor } from "./directory";
import {
  getCustomerProfile,
  listOrders as daoListOrders,
  ordersByIds as daoOrdersByIds,
  listShipments as daoListShipments,
  getShipment as daoGetShipment,
  listMessages as daoListMessages,
  thread as daoThread,
} from "./db/queries";
import type {
  CustomerProfileView,
  ImportInput,
  MessageInput,
  MessageView,
  OrderView,
  PlaceView,
  ShipmentView,
  TenantDO,
  TenantSettings,
} from "./tenant";
import type { RegistryDO } from "./registry";
import type { DaraAgent } from "./agent/dara";
import { dara } from "./agent/dara";

const TWILIO_FROM_NUMBER = "+16479526586";

export interface Env {
  GOOGLE_MAPS_API_KEY: string;
  // Gates the one-time /admin/migrate import; unset disables the route.
  MIGRATION_SECRET?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SHIPPO_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  AI: Ai;
  FILE_PARSE_LIMITER: RateLimit;
  DARA: DurableObjectNamespace<DaraAgent>;
  TENANT: DurableObjectNamespace<TenantDO>;
  REGISTRY: DurableObjectNamespace<RegistryDO>;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  APP_URL?: string;
  // Canonical origin used when a link is built server-side with no browser
  // to read window.location.origin from (Dara's SMS replies). Falls back to
  // production; override in .dev.vars to point local-dev-minted links at the
  // local client.
  [key: string]: any;
}

// Loose on purpose: submit() receives raw form data from the booking page.
export interface Order {
  id?: string;
  createdAt?: number | string | null;
  amountTotal?: number | null;
  amountPaid?: number | null;
  clearance?: string | null;
  [key: string]: unknown;
}

export interface Package {
  id?: string;
  number?: string | number | null;
  name?: string | null;
  phone?: string | null;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
}

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

// Reachable without a session: public booking and manifest previews do not
// read or write tenant data.
export interface PublicApi {
  submit(value: Order): Promise<string | null>;
  getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]>;
  getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ): Promise<ShippingProduct[]>;
  // Anonymous previews parse tabular manifests and are rate-limited.
  parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }): Promise<Package[]>;
  // Authenticated by an explicit org id in the URL rather than a signed
  // token: a customer with a link and no account reaches only their own
  // order. The org is provided as a query parameter.
  trackOrder(
    orderId: string,
    orgId: string,
  ): Promise<{ order: OrderView; thread: MessageView[] }>;
  // No signed token: profile links include the tenant/org id directly so a
  // browser hitting the link can be routed to the right tenant without a
  // session. See client/routes/profile.tsx and agent/dara.ts for link
  // construction.
  getProfile(customerId: string, orgId: string): Promise<CustomerProfileView>;
  submitProfile(
    customerId: string,
    orgId: string,
    patch: { name: string; email?: string | null; address?: PlaceView | null },
  ): Promise<CustomerProfileView>;
}

// Requires a verified Clerk session with an active organization. Every method
// is scoped to that org's Durable Object; there is no parameter for choosing
// whose data to touch, because the session decides.
export interface TenantApi {
  // Idempotent provisioning, called on every dashboard load. The org id comes
  // from the session; only the display name is passed, since Clerk owns it.
  ensureTenant(name: string): Promise<TenantSettings>;
  settings(): Promise<TenantSettings>;
  listOrders(): Promise<OrderView[]>;
  ordersByIds(ids: string[]): Promise<OrderView[]>;
  listShipments(): Promise<ShipmentView[]>;
  getShipment(shipmentId: string): Promise<ShipmentView | null>;
  runAgentTask(
    task: string,
  ): Promise<
    { ok: true; text: string; steps: number } | { ok: false; error: string }
  >;
  listMessages(limit?: number): Promise<MessageView[]>;
  thread(customerId: string, limit?: number): Promise<MessageView[]>;
  inbox(limit?: number): Promise<Record<string, unknown>[]>;
  createShipment(title: string): Promise<string>;
  updateShipmentTitle(shipmentId: string, title: string): Promise<void>;
  importPackages(
    input: ImportInput,
  ): Promise<{ created: number; shipmentId: string }>;
  appendMessage(message: MessageInput): Promise<boolean>;
  markHandled(eventId: number): Promise<void>;
  // Returns a full tracking URL for the given order (includes org id).
  createTrackingLink(orderId: string): Promise<{ url: string }>;
  // Same pattern for the profile form's link. See profile.ts.
  createProfileLink(customerId: string): Promise<{ url: string }>;
  getCustomerProfile(customerId: string): Promise<CustomerProfileView | null>;
  updateSettings(patch: {
    name?: string;
    twilioNumber?: string | null;
    markup?: number;
  }): Promise<TenantSettings>;
  sendMessage(
    messages: { to: string; body: string }[],
  ): Promise<{ sent: number; failed: number }>;
}

// Implementation only -- deliberately NOT an RpcTarget, so it can never be
// handed to a client wholesale. The two targets below choose what to expose.
export class RPC {
  #stripeClient?: Stripe;
  #shippoClient?: Shippo;
  #twilioClient?: ReturnType<typeof twilio>;

  constructor(
    private env: Env,
    private ctx: ExecutionContext | DurableObjectState,
  ) { }

  // All three clients are lazy: their constructors throw on missing keys, and
  // tenant reads share this target, so eager construction meant one unset
  // secret took down the entire dashboard.
  //
  // `#` rather than TypeScript's `private`, which is erased at runtime: capnweb
  // blocks own instance properties but resolves prototype getters, so a
  // `private get` here would be reachable as api.stripe from any browser.
  get #stripe() {
    return (this.#stripeClient ??= new Stripe(this.env.STRIPE_SECRET_KEY));
  }

  get #shippo() {
    return (this.#shippoClient ??= new Shippo({
      apiKeyHeader: this.env.SHIPPO_API_KEY,
    }));
  }

  get #twilio() {
    return (this.#twilioClient ??= twilio(
      this.env.TWILIO_ACCOUNT_SID,
      this.env.TWILIO_AUTH_TOKEN,
    ));
  }

  async submit(value: Order) {
    const session = await this.#stripe.checkout.sessions.create({
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
    const apiKey = this.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Places API error: GOOGLE_MAPS_API_KEY is not set");
      return [];
    }

    try {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify({
            input,
            includedRegionCodes: ["ca", "ng", "gb"],
          }),
        },
      );
      const data = (await response.json()) as {
        suggestions?: {
          placePrediction?: {
            placeId: string;
            text: { text: string };
            structuredFormat: {
              mainText: {
                text: string;
                matches?: { startOffset?: number; endOffset: number }[];
              };
              secondaryText: { text: string };
            };
          };
        }[];
        error?: { message?: string; status?: string };
      };

      if (!response.ok || data.error) {
        console.error("Places API error:", data.error ?? response.status);
        return [];
      }

      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          description: p.text.text,
          placeId: p.placeId,
          structuredFormatting: {
            mainText: p.structuredFormat.mainText.text,
            secondaryText: p.structuredFormat.secondaryText.text,
            mainTextMatchedSubstrings: (
              p.structuredFormat.mainText.matches ?? []
            ).map((m) => ({
              offset: m.startOffset ?? 0,
              length: m.endOffset - (m.startOffset ?? 0),
            })),
          },
        }));
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
        const parcel = await this.#shippo.parcels.create({
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

    const shipments = await this.#shippo.shipments.create({
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

  async parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }): Promise<Package[]> {
    const maxFileSize = 10 * 1024 * 1024;
    const fileName = typeof file?.name === "string"
      ? file.name.toLowerCase()
      : "";
    if (
      !file ||
      !/\.(csv|xlsx|docx)$/.test(fileName) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 1 ||
      file.size > maxFileSize ||
      typeof file.data !== "string" ||
      file.data.length !== Math.ceil(file.size / 3) * 4
    ) {
      throw new Error(
        "Choose a CSV, Excel (.xlsx), or DOCX file no larger than 10 MB.",
      );
    }
    const binary = atob(file.data);
    if (binary.length !== file.size) {
      throw new Error("The uploaded file data is invalid.");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const packages = await parseManifest(file.name, bytes);
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

  async sendMessage(messages: { to: string; body: string }[]) {
    const results = await Promise.allSettled(
      messages.map((m) =>
        this.#twilio.messages.create({
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

// The two things a client can actually be handed. Both wrap the service class
// above and expose a deliberate subset -- RPC itself is never sent over the
// wire, so a method can't become reachable by being added to it.

export class PublicRPC extends RpcTarget implements PublicApi {
  #rpc: RPC;
  #env: Env;
  #clientIp: string;

  constructor(env: Env, ctx: ExecutionContext, clientIp: string) {
    super();
    this.#rpc = new RPC(env, ctx);
    this.#env = env;
    this.#clientIp = clientIp;
  }

  submit(value: Order) {
    return this.#rpc.submit(value);
  }

  getPlaceSuggestions(input: string) {
    return this.#rpc.getPlaceSuggestions(input);
  }

  getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ) {
    return this.#rpc.getProducts(place, office, packages);
  }

  async parseFile(file: {
    name: string;
    type: string;
    size: number;
    data: string;
  }) {
    const { success } = await this.#env.FILE_PARSE_LIMITER.limit({
      key: `public-file-parse:${this.#clientIp}`,
    });
    if (!success) {
      throw new Error("Too many file previews. Please wait a minute and try again.");
    }
    return this.#rpc.parseFile(file);
  }

  async trackOrder(orderId: string, orgId: string) {
    const tenant = tenantFor(this.#env, orgId);
    const [order] = await daoOrdersByIds(tenant, [orderId]);
    if (!order) throw new Error("Order not found");
    const thread = order.customers
      ? await daoThread(tenant, order.customers.id)
      : [];
    return { order, thread };
  }

  async getProfile(customerId: string, orgId: string) {
    const tenant = tenantFor(this.#env, orgId);
    const profile = await getCustomerProfile(tenant, customerId);
    if (!profile) throw new Error("Customer not found");
    return profile;
  }

  async submitProfile(
    customerId: string,
    orgId: string,
    patch: { name: string; email?: string | null; address?: PlaceView | null },
  ) {
    const tenant = tenantFor(this.#env, orgId);
    return updateCustomerProfile(tenant, customerId, patch);
  }
}

export class TenantRPC extends RpcTarget implements TenantApi {
  #rpc: RPC;
  #env: Env;
  #orgId: string;
  #tenant: DurableObjectStub<TenantDO>;

  // The org comes from the verified session, never from the caller's
  // arguments, so no method here can be pointed at another tenant.
  constructor(env: Env, ctx: ExecutionContext, orgId: string) {
    super();
    this.#env = env;
    this.#orgId = orgId;
    this.#rpc = new RPC(env, ctx);
    this.#tenant = tenantFor(env, orgId);
  }

  // Creating the Durable Object is implicit -- addressing it is enough. This
  // is what turns an empty database into a configured tenant, and it also
  // records the org centrally so the platform knows what exists.
  async ensureTenant(name: string) {
    const settings = await this.#tenant.ensureInitialized(this.#orgId, name);
    await registry(this.#env).registerOrg(this.#orgId, name);
    return settings;
  }

  settings() {
    return this.#tenant.settings();
  }

  async createTrackingLink(orderId: string) {
    const base = this.#env.APP_URL ?? "https://smtncargo.com";
    const url = `${base}/orders/${encodeURIComponent(orderId)}?o=${encodeURIComponent(this.#orgId)}`;
    return { url };
  }

  async createProfileLink(customerId: string) {
    const base = this.#env.APP_URL ?? "https://smtncargo.com";
    const url = `${base}/profile?c=${encodeURIComponent(customerId)}&o=${encodeURIComponent(this.#orgId)}`;
    return { url };
  }

  getCustomerProfile(customerId: string) {
    return getCustomerProfile(this.#tenant, customerId);
  }

  async updateSettings(patch: {
    name?: string;
    twilioNumber?: string | null;
    markup?: number;
  }) {
    // Setting a number here only tells this tenant about itself -- the
    // registry is the only place inbound routing (tenantForNumber, used by
    // the Twilio webhook) actually looks. Without this, a number can look
    // configured in settings while every text to it is silently dropped as
    // unclaimed. Claim first: if another org already holds it, the whole
    // save should fail loudly rather than leave the tenant's own settings
    // out of sync with who SMS actually routes to.
    if (patch.twilioNumber) {
      await registry(this.#env).claimNumber(patch.twilioNumber, this.#orgId);
    }
    return this.#tenant.updateSettings(patch);
  }

  listOrders() {
    return daoListOrders(this.#tenant);
  }

  ordersByIds(ids: string[]) {
    return daoOrdersByIds(this.#tenant, ids);
  }

  listShipments() {
    return daoListShipments(this.#tenant);
  }

  getShipment(shipmentId: string) {
    return daoGetShipment(this.#tenant, shipmentId);
  }

  runAgentTask(task: string) {
    return dara(this.#env, this.#orgId, task);
  }

  listMessages(limit = 200) {
    return daoListMessages(this.#tenant, limit);
  }

  thread(customerId: string, limit = 50) {
    return daoThread(this.#tenant, customerId, limit);
  }

  inbox(limit = 50) {
    return this.#tenant.inbox(limit);
  }

  createShipment(title: string) {
    return this.#tenant.createShipment(title);
  }

  updateShipmentTitle(shipmentId: string, title: string) {
    return this.#tenant.updateShipmentTitle(shipmentId, title);
  }

  importPackages(input: ImportInput) {
    return this.#tenant.importPackages(input);
  }

  appendMessage(message: MessageInput) {
    return this.#tenant.recordMessage(message);
  }

  markHandled(eventId: number) {
    return this.#tenant.markHandled(eventId);
  }

  sendMessage(messages: { to: string; body: string }[]) {
    return this.#rpc.sendMessage(messages);
  }
}
