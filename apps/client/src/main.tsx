import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./app";
import { AndroidRouteBackHandler } from "./components/android-route-back-handler";
import { PrivacyControls } from "./components/privacy-controls";
import { PushEndpointSync } from "./components/push-endpoint-sync";
import { AuthProvider } from "./lib/auth";
import { PrivacyProvider } from "./lib/privacy";
import { applicationRuntime } from "./lib/runtime";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AndroidRouteBackHandler enabled={applicationRuntime === "android-client"} />
        <PrivacyProvider>
          <AuthProvider>
            <App />
            <PushEndpointSync />
            <Toaster
              position="top-right"
              theme="dark"
              richColors
              closeButton
              offset={{
                top: "calc(1rem + var(--safe-area-top))",
                right: "calc(1rem + var(--safe-area-right))",
              }}
              mobileOffset={{
                top: "calc(0.75rem + var(--safe-area-top))",
                right: "calc(0.75rem + var(--safe-area-right))",
                left: "calc(0.75rem + var(--safe-area-left))",
              }}
            />
            <PrivacyControls />
          </AuthProvider>
        </PrivacyProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
