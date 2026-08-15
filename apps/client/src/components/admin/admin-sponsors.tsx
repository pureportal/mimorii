import { sponsorshipTiers, type ManagedSponsor, type SponsorshipTier } from "@mimorii/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { isSponsorshipTier } from "../../lib/sponsorship";
import { EmptyState, ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { ConfirmationDialog } from "../ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input, Select } from "../ui/input";
import { SponsorImageUpload, type SponsorImageSelection } from "./sponsor-image-upload";
import { SponsorTierList } from "./sponsor-tier-list";

export function AdminSponsors() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ManagedSponsor | null | undefined>(undefined);
  const [deleteSponsor, setDeleteSponsor] = useState<ManagedSponsor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [orderedSponsors, setOrderedSponsors] = useState<ManagedSponsor[]>([]);
  const [reorderingTier, setReorderingTier] = useState<SponsorshipTier | null>(null);
  const [orderStatus, setOrderStatus] = useState("");
  const sponsors = useQuery({
    queryKey: ["global-admin", "sponsors"],
    queryFn: () => api<ManagedSponsor[]>("/admin/sponsors"),
  });

  useEffect(() => {
    if (sponsors.data) setOrderedSponsors(sponsors.data);
  }, [sponsors.data]);

  if (sponsors.isLoading) return <LoadingState />;
  if (sponsors.isError) return <ErrorState retry={() => void sponsors.refetch()} />;

  async function refreshAfterMutation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-admin", "sponsors"] }),
      queryClient.invalidateQueries({ queryKey: ["global-admin", "statistics"] }),
      queryClient.invalidateQueries({ queryKey: ["sponsors"] }),
    ]);
    setSelected(undefined);
  }

  async function remove(sponsor: ManagedSponsor) {
    setDeleting(true);
    try {
      await api(`/admin/sponsors/${sponsor.id}`, {
        method: "DELETE",
        ...jsonBody({ expectedUpdatedAt: sponsor.updatedAt }),
      });
      await refreshAfterMutation();
      toast.success("Sponsor deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sponsor could not be deleted");
    } finally {
      setDeleting(false);
      setDeleteSponsor(null);
    }
  }

  async function reorder(tier: SponsorshipTier, sponsorIds: string[]) {
    if (reorderingTier) return;
    const previousSponsors = orderedSponsors;
    const nextOrder = new Map(sponsorIds.map((id, index) => [id, index]));
    setOrderedSponsors(
      previousSponsors.map((sponsor) =>
        sponsor.tier === tier
          ? { ...sponsor, displayOrder: nextOrder.get(sponsor.id) ?? sponsor.displayOrder }
          : sponsor
      )
    );
    setReorderingTier(tier);
    setOrderStatus("");
    try {
      const updatedSponsors = await api<ManagedSponsor[]>("/admin/sponsors/order", {
        method: "PATCH",
        ...jsonBody({ tier, sponsorIds }),
      });
      setOrderedSponsors(updatedSponsors);
      queryClient.setQueryData(["global-admin", "sponsors"], updatedSponsors);
      await queryClient.invalidateQueries({ queryKey: ["sponsors"] });
      setOrderStatus(`${tier[0]!.toUpperCase()}${tier.slice(1)} order saved`);
    } catch (error) {
      setOrderedSponsors(previousSponsors);
      const refreshed = await sponsors.refetch();
      if (refreshed.data) setOrderedSponsors(refreshed.data);
      toast.error(error instanceof Error ? error.message : "Sponsor order could not be saved");
      setOrderStatus("Sponsor order was not saved");
    } finally {
      setReorderingTier(null);
    }
  }

  const tierGroups = sponsorshipTiers
    .map((tier) => ({
      tier,
      sponsors: orderedSponsors
        .filter((sponsor) => sponsor.tier === tier)
        .toSorted(
          (first, second) =>
            first.displayOrder - second.displayOrder || first.name.localeCompare(second.name)
        ),
    }))
    .filter((group) => group.sponsors.length > 0);

  return (
    <Card>
      <CardHeader className="items-center">
        <h3 className="font-display font-bold">Sponsors</h3>
        <Button variant="coral" size="sm" onClick={() => setSelected(null)}>
          <Plus /> Add sponsor
        </Button>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-5 sm:pt-2">
        {tierGroups.length ? (
          <div className="grid gap-4">
            {tierGroups.map((group) => (
              <SponsorTierList
                key={group.tier}
                tier={group.tier}
                sponsors={group.sponsors}
                disabled={reorderingTier !== null}
                onDelete={setDeleteSponsor}
                onEdit={setSelected}
                onReorder={(tier, sponsorIds) => void reorder(tier, sponsorIds)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No sponsors" />
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {orderStatus}
        </p>
      </CardContent>
      {selected !== undefined ? (
        <SponsorDialog
          key={selected?.updatedAt ?? "new"}
          sponsor={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
          onSaved={refreshAfterMutation}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(deleteSponsor)}
        onOpenChange={(open) => {
          if (!open) setDeleteSponsor(null);
        }}
        title={`Delete ${deleteSponsor?.name ?? "sponsor"}?`}
        confirmLabel="Delete sponsor"
        pending={deleting}
        onConfirm={() => {
          if (deleteSponsor) void remove(deleteSponsor);
        }}
      />
    </Card>
  );
}

function SponsorDialog({
  sponsor,
  open,
  onOpenChange,
  onSaved,
}: {
  sponsor: ManagedSponsor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(sponsor?.name ?? "");
  const [tier, setTier] = useState<SponsorshipTier>(sponsor?.tier ?? "silver");
  const [websiteUrl, setWebsiteUrl] = useState(sponsor?.websiteUrl ?? "");
  const [published, setPublished] = useState(sponsor?.published ?? false);
  const [imageSelection, setImageSelection] = useState<SponsorImageSelection>({
    file: null,
    removeCurrent: false,
  });
  const [imageReady, setImageReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!imageReady) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("name", name);
      body.set("tier", tier);
      if (websiteUrl.trim()) body.set("websiteUrl", websiteUrl.trim());
      body.set("published", String(published));
      if (sponsor) body.set("expectedUpdatedAt", sponsor.updatedAt);
      if (imageSelection.file) body.set("favicon", imageSelection.file);
      if (imageSelection.removeCurrent) body.set("removeFavicon", "true");
      await api(sponsor ? `/admin/sponsors/${sponsor.id}` : "/admin/sponsors", {
        method: sponsor ? "PATCH" : "POST",
        body,
      });
      await onSaved();
      toast.success(sponsor ? "Sponsor updated" : "Sponsor added");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sponsor could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent closeDisabled={busy}>
        <DialogHeader title={sponsor ? "Edit sponsor" : "Add sponsor"} />
        <form className="grid gap-5" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="sponsor-admin-name">Name</FieldLabel>
            <Input
              id="sponsor-admin-name"
              required
              minLength={2}
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-admin-tier">Tier</FieldLabel>
            <Select
              id="sponsor-admin-tier"
              value={tier}
              disabled={busy}
              onChange={(event) => {
                if (isSponsorshipTier(event.target.value)) setTier(event.target.value);
              }}
            >
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-admin-website">Website</FieldLabel>
            <Input
              id="sponsor-admin-website"
              type="url"
              maxLength={2048}
              value={websiteUrl}
              disabled={busy}
              onChange={(event) => setWebsiteUrl(event.target.value)}
            />
          </Field>
          <SponsorImageUpload
            currentImage={
              sponsor?.faviconUpdatedAt
                ? { sponsorId: sponsor.id, updatedAt: sponsor.faviconUpdatedAt }
                : null
            }
            disabled={busy}
            onReadyChange={setImageReady}
            onSelectionChange={setImageSelection}
          />
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <span className="text-sm font-semibold">Published</span>
            <input
              type="checkbox"
              checked={published}
              disabled={busy}
              onChange={(event) => setPublished(event.target.checked)}
              className="size-5 accent-[var(--color-coral)]"
            />
          </label>
          <FieldError>{error ? <span role="alert">{error}</span> : null}</FieldError>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={busy || !imageReady}>
              {busy ? "Saving…" : "Save sponsor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
