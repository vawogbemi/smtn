import { newHttpBatchRpcSession } from "capnweb";
import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import type { PublicApi, TenantApi } from "../rpc";

// Cast straight to the plain interface rather than RpcStub<T>: every method
// already returns a Promise, and both RpcStub and the Serializable<T> bound on
// newHttpBatchRpcSession exceed TypeScript's instantiation depth on interfaces
// this size. Erasing the generic here keeps call sites fully typed.
const session = (target: string | Request): unknown =>
  (newHttpBatchRpcSession as unknown as (t: string | Request) => unknown)(
    target,
  );

// No session. Quotes and address lookup for the public booking page.
export const publicApi = () => session("/rpc") as PublicApi;

// Requires a Clerk session with an active organization. The org is read from
// the verified token on the server, never sent by the client, so there is no
// tenant parameter to tamper with.
export const tenantApi = (token: string) =>
  session(
    new Request(new URL("/tenant", window.location.href), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  ) as TenantApi;

// The read half. Writes are called directly on the stub from useTenantApi().
type Reads = Pick<
  TenantApi,
  | "listOrders"
  | "ordersByIds"
  | "listShipments"
  | "getShipment"
  | "listMessages"
  | "thread"
  | "inbox"
  | "settings"
>;

type Args<M extends keyof Reads> = Reads[M] extends (...a: infer A) => unknown
  ? A
  : never;
type Result<M extends keyof Reads> = Reads[M] extends (
  ...a: never[]
) => Promise<infer R>
  ? R
  : never;

// Every live query re-runs when the tenant object broadcasts a change. This is
// deliberately coarse -- one socket message refetches everything on screen --
// which is what InstantDB's per-query invalidation did for us before. It is
// correct and cheap at a handful of operators; narrowing it by `scope` is the
// obvious next step if that stops being true.
const subscribers = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;

function connect(token: string) {
  if (socket || typeof window === "undefined") return;
  const url = new URL("/ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  // Sockets can't carry an Authorization header from the browser, so the token
  // rides in the query string; the Worker verifies it before touching a tenant.
  url.searchParams.set("token", token);

  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener("message", () => {
    for (const refetch of subscribers) refetch();
  });

  const reconnect = () => {
    if (socket !== ws) return;
    socket = null;
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => subscribers.size > 0 && connect(token), 2000);
  };
  ws.addEventListener("close", reconnect);
  ws.addEventListener("error", reconnect);
}

// capnweb's transport layer discards the response body on a non-101/200, so
// an auth failure at /tenant (a plain JSON 401/403, since it's rejected
// before capnweb parsing ever starts) surfaces to callers only as "RPC
// request failed: 401 Unauthorized" -- no indication of *why*. This re-issues
// the same request as an ordinary fetch to recover the real message; only
// worth the extra round trip on the error path, never on success.
export async function describeTenantAuthError(
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(new URL("/tenant", window.location.href), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return null; // auth was fine; the failure is something else
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    return body?.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return null;
  }
}

/** Authenticated stub factory for writes. */
export function useTenantApi() {
  const { getToken } = useAuth();
  return useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in");
    return tenantApi(token);
  }, [getToken]);
}

export function useQuery<M extends keyof Reads>(
  method: M,
  ...args: Args<M>
): { data: Result<M> | undefined; isLoading: boolean; error: unknown } {
  const { getToken, isLoaded, isSignedIn, orgId } = useAuth();
  const [state, setState] = useState<{
    data: Result<M> | undefined;
    isLoading: boolean;
    error: unknown;
  }>({ data: undefined, isLoading: true, error: undefined });

  // Args are values, not identities, so compare them structurally -- callers
  // pass array literals that would otherwise refetch on every render.
  const argsKey = JSON.stringify(args);

  useEffect(() => {
    // Waiting on Clerk, signed out, or no org selected: stay in loading rather
    // than firing a call that is guaranteed to 401.
    if (!isLoaded || !isSignedIn || !orgId) return;

    let cancelled = false;

    const run = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        const stub = tenantApi(token) as unknown as Record<
          string,
          (...a: unknown[]) => Promise<unknown>
        >;
        const data = await stub[method as string](
          ...(JSON.parse(argsKey) as unknown[]),
        );
        if (!cancelled) {
          setState({
            data: data as Result<M>,
            isLoading: false,
            error: undefined,
          });
        }
        connect(token);
      } catch (error) {
        if (!cancelled) setState({ data: undefined, isLoading: false, error });
      }
    };

    run();
    subscribers.add(run);

    return () => {
      cancelled = true;
      subscribers.delete(run);
    };
  }, [method, argsKey, isLoaded, isSignedIn, orgId, getToken]);

  return state;
}

// Call after a write so the writer sees its own change immediately rather than
// waiting for the broadcast to make the round trip.
export function refetchAll() {
  for (const refetch of subscribers) refetch();
}
