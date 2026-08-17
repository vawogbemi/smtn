import { Hono } from "hono";
import { cors } from "hono/cors";
import { renderToString } from "react-dom/server";
import { ViteClient, Script, Link, ReactRefresh } from "vite-ssr-components/react";
import { newWorkersRpcResponse } from "capnweb";
import { PublicRPC, TenantRPC, type Env } from "./rpc";
import { dara } from "./agent/codemode";
import { tenantFor } from "./directory";
import { AuthError, requireSession } from "./auth";
export { TenantDO } from "./tenant";
export { RegistryDO } from "./registry";
import { handleStripeWebhook, handleTwilioWebhook } from "./webhook";
import App from "./client/App";

const app = new Hono<{ Bindings: Env }>();

app.post("/webhook/stripe", (c) =>
  handleStripeWebhook(c.req.raw, c.env, c.executionCtx),
);

app.post("/webhook/twilio", (c) =>
  handleTwilioWebhook(c.req.raw, c.env, c.executionCtx),
);

// Public surface: quotes and address lookup for the booking page. Serves
// PublicRPC, which has no path to tenant storage.
app.use("/rpc", cors());

app.all("/rpc", (c) =>
  newWorkersRpcResponse(c.req.raw, new PublicRPC(c.env, c.executionCtx)),
);

// Everything tenant-scoped. The org comes from the verified token and is fixed
// into the target's constructor, so no method below can be aimed elsewhere.
app.all("/tenant", async (c) => {
  try {
    const { orgId } = await requireSession(c.req.raw, c.env);
    return newWorkersRpcResponse(
      c.req.raw,
      new TenantRPC(c.env, c.executionCtx, orgId),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

// One-time InstantDB import, driven by scripts/migrate-instant.mjs. Secret-
// gated because it writes straight into tenant storage; the load is idempotent
// by primary key, so a repeated run is harmless. Safe to delete once migrated.
app.post("/admin/migrate", async (c) => {
  const secret = c.env.MIGRATION_SECRET;
  if (!secret || c.req.header("x-migration-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }
  // Which tenant receives the import must be explicit -- there is no longer a
  // default org to fall back to.
  const orgId = c.req.query("org");
  if (!orgId) return c.json({ error: "org query parameter is required" }, 400);
  const snapshot = await c.req.json<Record<string, unknown[]>>();
  return c.json(await tenantFor(c.env, orgId).importSnapshot(snapshot));
});

// Live invalidation for the dashboard. Browsers can't set headers on a
// WebSocket, so the token arrives as a query parameter and is verified the
// same way before any tenant object is addressed.
app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected a websocket upgrade", 426);
  }
  const token = c.req.query("token") ?? "";
  const authed = new Request(c.req.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  try {
    const { orgId } = await requireSession(authed, c.env);
    return tenantFor(c.env, orgId).fetch(c.req.raw);
  } catch (error) {
    if (error instanceof AuthError) {
      return c.text(error.message, error.status);
    }
    throw error;
  }
});

// Was open to the internet with canSend and canWrite both true. Now it runs
// against the caller's own tenant, under their session.
app.use("/dara", cors());

app.post("/dara", async (c) => {
  try {
    const { orgId } = await requireSession(c.req.raw, c.env);
    const { task } = await c.req
      .json<{ task?: string }>()
      .catch(() => ({}) as { task?: string });
    if (!task) return c.json({ error: "task is required" }, 400);
    return c.json(await dara(c.env, c.executionCtx, orgId, task));
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

app.get("*", (c) => {
  const html = renderToString(
    <html lang="en" className="w-full h-full bg-surface">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SMTN Cargo</title>
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(()=>{try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
        <ViteClient />
        <ReactRefresh />
        <Link href="/src/client/style.css" rel="stylesheet" />
        <Script src="/src/client/index.tsx" />
      </head>
      <body className="h-full">
        <div id="root" className="h-full">
          <App />
        </div>
      </body>
    </html>,
  );
  return c.html(`<!DOCTYPE html>${html}`);
});

export default app;
