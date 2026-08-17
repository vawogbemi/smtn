import { Provider, defaultTheme } from "@adobe/react-spectrum";
import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Spinner } from "./components/misc.js";
import { ThemeProvider, useTheme } from "./components/theme";
import { RequireTenant } from "./onboarding";
import Index from "./routes/_index";
import Dashboard from "./routes/dashboard";
import Track from "./routes/track";
import Activity from "./routes/activity";
import { Shipments, Shipment } from "./routes/shipments";
import Profile from "./routes/profile";

import Orders from "./routes/orders";

const FixedTheme = ({ children }: { children: ReactNode }) => (
  <div data-theme="light" className="w-full h-full">
    <Provider theme={defaultTheme} colorScheme="light" UNSAFE_className="w-full h-full">
      {children}
    </Provider>
  </div>
);

const Layout = () => {
  // BrowserRouter needs `window`, which the Worker's renderToString pass
  // doesn't have, so the router tree can only render client-side. The naive
  // `typeof window === "undefined"` check caused a hydration mismatch: it's
  // true during SSR but already false by the client's *first* hydration
  // pass, so the two disagreed about what the root renders before any effect
  // ever ran. Gating on mounted state instead defers the branch to after
  // hydration completes -- the client's first pass renders the identical
  // spinner the server sent, and the swap to the real tree happens as an
  // ordinary post-mount update, not during hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Spinner />;
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route index element={<FixedTheme><Index /></FixedTheme>} />
          {/* Sign-in, company creation, and tenant provisioning all happen in
              RequireTenant before any dashboard route renders. The customer
              routes below stay public -- shippers never get an account. */}
          <Route
            path="dashboard"
            element={
              <RequireTenant>
                <Dashboard />
              </RequireTenant>
            }
          >
            <Route index element={<Activity />} />
            <Route path="shipments" element={<Shipments />}>
              <Route path=":shipmentId" element={<Shipment />} />
            </Route>
          </Route>
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:orderId" element={<Orders />} />
          <Route path="track/:orderId" element={<FixedTheme><Track /></FixedTheme>} />
          <Route path="profile" element={<FixedTheme><Profile /></FixedTheme>} />
          <Route path="*" element={<p>Not Found</p>} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const ThemedApp = () => {
  const { theme } = useTheme();
  return (
    <Provider
      theme={defaultTheme}
      colorScheme={theme}
      UNSAFE_className="w-full h-full"
    >
      <Layout />
    </Provider>
  );
};

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const App = () => {
  if (!PUBLISHABLE_KEY) {
    // Failing loudly beats a blank dashboard: without this the sign-in flow
    // silently never renders.
    return (
      <div className="p-6 text-sm text-red-600">
        VITE_CLERK_PUBLISHABLE_KEY is not set. Add it to .env so the dashboard
        can authenticate.
      </div>
    );
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </ClerkProvider>
  );
};

export default App;
