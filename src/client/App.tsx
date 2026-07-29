import { Provider, defaultTheme } from "@adobe/react-spectrum";
import type { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { db } from "../instant.js";
import { Spinner } from "./components/misc.js";
import { ThemeProvider, useTheme } from "./components/theme";
import Index from "./routes/_index";
import Dashboard from "./routes/dashboard";
import Track from "./routes/track";
import { Shipments, Shipment } from "./routes/shipments";

const FixedTheme = ({ children }: { children: ReactNode }) => (
  <div data-theme="light" className="w-full h-full">
    <Provider theme={defaultTheme} colorScheme="light" UNSAFE_className="w-full h-full">
      {children}
    </Provider>
  </div>
);

const Layout = () => {
  if (typeof window === "undefined") {
    return <Spinner />;
  }

  const { isLoading, error } = db.useAuth();

  if (isLoading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="text-red-600">
        An error occurred, please try again later
      </div>
    );
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route index element={<FixedTheme><Index /></FixedTheme>} />
          {/* <db.SignedIn> */}
          <Route path="dashboard" element={<Dashboard />}>
            <Route index element={<Shipments/>} />
            <Route path="shipments" element={<Shipments />}>
              <Route path=":shipmentId" element={<Shipment />} />
            </Route>
          </Route>
          {/* </db.SignedIn> */}
          <Route path="track/:orderId" element={<FixedTheme><Track /></FixedTheme>} />
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

const App = () => (
  <ThemeProvider>
    <ThemedApp />
  </ThemeProvider>
);

export default App;
