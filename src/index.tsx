import { Hono } from "hono";
import { cors } from "hono/cors";
import { renderToString } from "react-dom/server";
import { ViteClient, Script, Link, ReactRefresh } from "vite-ssr-components/react";
import { newWorkersRpcResponse } from "capnweb";
import { RPC, type Env } from "./rpc";
import { dara } from "./codemode";
import { handleStripeWebhook, handleTwilioWebhook } from "./webhook";
import App from "./client/App";

const app = new Hono<{ Bindings: Env }>();

app.post("/webhook/stripe", (c) =>
  handleStripeWebhook(c.req.raw, c.env, c.executionCtx),
);

app.post("/webhook/twilio", (c) =>
  handleTwilioWebhook(c.req.raw, c.env, c.executionCtx),
);

app.use("/rpc", cors());

app.all("/rpc", (c) =>
  newWorkersRpcResponse(c.req.raw, new RPC(c.env, c.executionCtx)),
);

app.use("/dara", cors());

app.post("/dara", async (c) => {
  const { task } = await c.req
    .json<{ task?: string }>()
    .catch(() => ({}) as { task?: string });
  if (!task) return c.json({ error: "task is required" }, 400);
  return c.json(await dara(c.env, c.executionCtx, task));
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
