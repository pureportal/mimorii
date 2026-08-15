import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function InvitePage() {
  const { token = "" } = useParams();
  const { session, refreshIdentity } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"ready" | "accepting" | "error">("ready");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!session || state !== "ready") return;
    setState("accepting");
    void api(`/team-invitations/${encodeURIComponent(token)}/accept`, { method: "POST" })
      .then(async () => {
        await refreshIdentity();
        void navigate("/app", { replace: true });
      })
      .catch((error: Error) => {
        setMessage(error.message);
        setState("error");
      });
  }, [navigate, refreshIdentity, session, state, token]);

  return (
    <main className="grid place-items-center px-5 py-12">
      <Card className="w-full max-w-md p-7 text-center">
        <h1 className="font-display text-2xl font-black">Team invitation</h1>
        {!session ? (
          <>
            <p className="mt-3 text-sm text-muted">Sign in with the invited email.</p>
            <Button asChild variant="coral" className="mt-6">
              <Link to="/login" state={{ from: `/invite/${token}` }}>
                Sign in
              </Link>
            </Button>
          </>
        ) : state === "error" ? (
          <>
            <p className="mt-3 text-sm text-danger">{message}</p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/app">Open overview</Link>
            </Button>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">Joining team…</p>
        )}
        <Link to="/privacy" className="mt-6 inline-block text-xs font-semibold text-violet-strong">
          Privacy policy
        </Link>
      </Card>
    </main>
  );
}
