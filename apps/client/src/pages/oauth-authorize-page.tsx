import type {
  OAuthAuthorizationDecisionResult,
  OAuthAuthorizationRequestSummary,
} from "@mimorii/contracts";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Brand } from "../components/brand";
import { LoadingState } from "../components/page-state";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { FieldError } from "../components/ui/field";
import { api, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";

export function OAuthAuthorizePage() {
  const { session } = useAuth();
  const location = useLocation();
  const [request, setRequest] = useState<OAuthAuthorizationRequestSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return undefined;
    let active = true;
    setRequest(null);
    setError("");
    void api<OAuthAuthorizationRequestSummary>(`/oauth/authorization-request${location.search}`)
      .then((value) => {
        if (active) setRequest(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Authorization request failed");
        }
      });
    return () => {
      active = false;
    };
  }, [location.search, session]);

  if (!session) {
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    );
  }

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      const input = Object.fromEntries(new URLSearchParams(location.search));
      const result = await api<OAuthAuthorizationDecisionResult>("/oauth/authorization", {
        method: "POST",
        ...jsonBody({ ...input, decision }),
      });
      window.location.replace(result.redirectUri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization request failed");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md">
        <Brand className="mb-6 justify-center" />
        <Card className="p-6 sm:p-8">
          {request ? (
            <>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
                  <ShieldCheck />
                </span>
                <div className="min-w-0">
                  <h1 className="font-display text-2xl font-black tracking-tight">
                    Connect {request.clientName}
                  </h1>
                </div>
              </div>
              <dl className="mt-5 grid gap-2 text-sm">
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted">Client</dt>
                  <dd className="break-all">{request.clientHost}</dd>
                </div>
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted">Returns to</dt>
                  <dd className="break-all">{request.redirectHost}</dd>
                </div>
              </dl>
              {request.redirectIsLoopback ? (
                <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  Only continue if you opened this local app.
                </p>
              ) : null}
              <ul className="mt-6 grid gap-2 text-sm">
                <li>View monitoring data</li>
                {request.scopes.includes("mcp:write") ? (
                  <li>Change resources and publish incident updates</li>
                ) : null}
                {request.refreshAccess ? <li>Stay connected until access is revoked</li> : null}
              </ul>
              <div className="mt-5">
                <FieldError>{error}</FieldError>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => decide("deny")}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="coral"
                  disabled={busy}
                  onClick={() => decide("approve")}
                >
                  Allow
                </Button>
              </div>
            </>
          ) : error ? (
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight">
                Authorization failed
              </h1>
              <div className="mt-4">
                <FieldError>{error}</FieldError>
              </div>
            </div>
          ) : (
            <LoadingState />
          )}
        </Card>
      </div>
    </main>
  );
}
