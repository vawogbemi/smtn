import {
  CreateOrganization,
  SignIn,
  useAuth,
  useOrganization,
} from "@clerk/clerk-react";
import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "./components/misc.js";
import { describeTenantAuthError, useTenantApi } from "./data";

// The dashboard's front door. Three gates in order:
//
//   1. signed out            -> Clerk sign-in
//   2. signed in, no org     -> name your company (Clerk's own form)
//   3. org selected          -> provision the tenant, then render
//
// Step 3 is what turns a Clerk organization into a freight forwarder: a
// Durable Object exists the moment it is addressed, so provisioning means
// writing its identity and settings, not creating storage.

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex w-full h-full items-center justify-center p-4">
    {children}
  </div>
);

export const RequireTenant = ({ children }: { children: ReactNode }) => {
  const { isLoaded, isSignedIn, orgId, getToken } = useAuth();
  const { organization } = useOrganization();
  const getApi = useTenantApi();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgName = organization?.name;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !orgId) return;
    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        const api = await getApi();
        await api.ensureTenant(orgName ?? "Untitled");
        if (!cancelled) setReady(true);
      } catch (e) {
        if (cancelled) return;
        const generic = e instanceof Error ? e.message : String(e);
        // capnweb collapses every non-101/200 response into "RPC request
        // failed: <status> <statusText>", so on that specific shape a plain
        // fetch is worth the extra round trip to recover the real reason
        // (missing CLERK_SECRET_KEY, expired token, etc).
        if (/^RPC request failed:/.test(generic)) {
          const token = await getToken().catch(() => null);
          const reason = token ? await describeTenantAuthError(token) : null;
          if (!cancelled) setError(reason ?? generic);
        } else if (!cancelled) {
          setError(generic);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, orgId, orgName, getApi]);

  if (!isLoaded) return <Spinner />;

  if (!isSignedIn) {
    return (
      <Centered>
        <SignIn routing="hash" />
      </Centered>
    );
  }

  // Signed in with no organization. Clerk's form collects the company name,
  // which becomes the tenant's name, the SMS signature, and part of the
  // agent's prompt -- so it is worth asking rather than generating.
  if (!orgId) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">
            Create your company to finish setting up.
          </p>
          <CreateOrganization
            routing="hash"
            afterCreateOrganizationUrl="/dashboard"
          />
        </div>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-semibold text-text-primary">
            Could not set up your workspace
          </p>
          <p className="text-sm text-text-muted max-w-100">{error}</p>
        </div>
      </Centered>
    );
  }

  if (!ready) return <Spinner />;

  return <>{children}</>;
};
