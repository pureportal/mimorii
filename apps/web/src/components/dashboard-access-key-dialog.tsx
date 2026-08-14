import { Copy } from "lucide-react";
import { toast } from "sonner";
import { dashboardShareUrl } from "../lib/dashboard-links";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";

export function DashboardAccessKeyDialog({
  accessKey,
  slug,
  onOpenChange,
}: {
  accessKey: string | null;
  slug: string;
  onOpenChange: (open: boolean) => void;
}) {
  const url = accessKey ? dashboardShareUrl(slug, accessKey) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Link could not be copied");
    }
  }

  return (
    <Dialog open={Boolean(accessKey)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Protected link">
          Copy this link now. It won&apos;t be shown again.
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input readOnly value={url} aria-label="Protected dashboard link" />
          <Button type="button" onClick={() => void copy()} className="shrink-0">
            <Copy /> Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
