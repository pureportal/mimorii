import { ExternalLink, KeyRound, ServerCog, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ApiTokensCard } from "../components/api-tokens-card";
import { NotificationDeviceCard } from "../components/notification-device-card";
import { PrivacySettingsButton } from "../components/privacy-controls";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { api, getServerUrl, jsonBody, setServerUrl } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { session, activeTeam, refreshIdentity, logout } = useAuth();
  const [name, setName] = useState(session!.user.name);
  const [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [server, setServer] = useState(getServerUrl());
  const [serverError, setServerError] = useState("");

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError("");
    try {
      await api("/auth/profile", { method: "PATCH", ...jsonBody({ name }) });
      await refreshIdentity();
      toast.success("Profile updated");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Profile could not be updated");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    try {
      await api("/auth/password", {
        method: "POST",
        ...jsonBody({ currentPassword, newPassword }),
      });
      toast.success("Password changed");
      logout();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Password could not be changed");
    }
  }

  function changeServer(event: FormEvent) {
    event.preventDefault();
    setServerError("");
    try {
      setServerUrl(server);
      logout();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Server URL is invalid");
    }
  }

  const docsUrl = new URL(getServerUrl());
  docsUrl.pathname = "/docs";

  return (
    <div data-guide-page="account-settings" className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
              <UserRound />
            </span>
            <h2 className="font-display font-bold">Profile</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={saveProfile}>
            <Field>
              <FieldLabel htmlFor="settings-name">Name</FieldLabel>
              <Input
                id="settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input value={session!.user.email} disabled />
            </Field>
            <FieldError>{profileError}</FieldError>
            <Button type="submit" variant="coral" className="justify-self-end">
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <ApiTokensCard />

      <NotificationDeviceCard teamId={activeTeam!.id} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-coral/14 text-danger">
              <KeyRound />
            </span>
            <h2 className="font-display font-bold">Password</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={changePassword}>
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                required
              />
            </Field>
            <FieldError>{passwordError}</FieldError>
            <Button type="submit" variant="outline" className="justify-self-end">
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-mint/20 text-success-strong">
              <ServerCog />
            </span>
            <h2 className="font-display font-bold">Server</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={changeServer}>
            <Field>
              <FieldLabel htmlFor="settings-server">Server URL</FieldLabel>
              <Input
                id="settings-server"
                type="url"
                value={server}
                onChange={(event) => setServer(event.target.value)}
                required
              />
            </Field>
            <FieldError>{serverError}</FieldError>
            <div className="flex justify-between gap-3">
              <Button asChild variant="ghost">
                <a href={docsUrl.toString()} target="_blank" rel="noreferrer">
                  API docs <ExternalLink />
                </a>
              </Button>
              <Button type="submit" variant="outline">
                Save & sign out
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-display font-bold">Mimorii</h2>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-xl bg-ink/[.035] p-4 text-sm">
              <span className="text-muted">Version</span>
              <span className="font-mono font-semibold">1.0.0</span>
            </div>
            <nav
              aria-label="Legal"
              className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-violet-strong"
            >
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/imprint">Imprint</Link>
            </nav>
            <PrivacySettingsButton variant="outline" className="justify-self-start" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
