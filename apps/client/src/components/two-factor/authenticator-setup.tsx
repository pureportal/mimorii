import type { TwoFactorSetup } from "@mimorii/contracts";
import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

export function AuthenticatorSetup({ setup }: { setup: TwoFactorSetup }) {
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
    } catch {
      toast.error("Setup key could not be copied");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="justify-self-center rounded-2xl bg-white p-2">
        <QRCodeSVG
          value={setup.uri}
          size={184}
          level="M"
          marginSize={4}
          title="Authenticator QR code"
        />
      </div>
      <Field>
        <FieldLabel htmlFor="authenticator-setup-key">Setup key</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="authenticator-setup-key"
            value={setup.secret.replace(/(.{4})(?=.)/g, "$1 ")}
            readOnly
            className="font-mono text-xs sm:text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copy setup key"
            onClick={() => void copySecret()}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </Field>
    </div>
  );
}
