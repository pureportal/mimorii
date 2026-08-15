import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./app";
import { PrivacyControls } from "./components/privacy-controls";
import { PushEndpointSync } from "./components/push-endpoint-sync";
import { AuthProvider } from "./lib/auth";
import { PrivacyProvider } from "./lib/privacy";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PrivacyProvider>
          <AuthProvider>
            <App />
            <PushEndpointSync />
            <Toaster position="top-right" theme="dark" richColors closeButton />
            <PrivacyControls />
          </AuthProvider>
        </PrivacyProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
