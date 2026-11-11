import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getServerUrl } from "../../lib/api";
import { applicationRuntime } from "../../lib/runtime";
import { Button } from "../ui/button";

export function RecoveryCodesPanel({ codes, email }: { codes: string[]; email: string }) {
  const [copied, setCopied] = useState(false);
  const server = new URL(getServerUrl()).host;
  const text = `Mimorii recovery codes for ${email} (${server})\n\n${codes.join("\n")}\n`;

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Recovery codes could not be copied");
    }
  }

  function downloadCodes() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mimorii-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Save these codes now. Each code works once.</p>
      <ol
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-ink/[.035] p-4 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copyCodes()}>
          {copied ? <Check /> : <Copy />} Copy
        </Button>
        {applicationRuntime === "android-client" ? null : (
          <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>
            <Download /> Download
          </Button>
        )}
      </div>
    </div>
  );
}
