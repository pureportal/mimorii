import type { ResourceSummary } from "@mimorii/contracts";
import { RefreshCw, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { imageAssetAccept, imageAssetRequirements, validateImageAsset } from "../lib/image-asset";
import { ResourceImage } from "./resource-image";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function ResourceImageDialog({
  open,
  onOpenChange,
  resource,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceSummary;
  onSaved: () => Promise<void>;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const validationSequence = useRef(0);

  useEffect(() => {
    if (!open) return;
    validationSequence.current += 1;
    setFile(null);
    setError("");
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    const sequence = ++validationSequence.current;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    setFile(null);
    try {
      await validateImageAsset(selected);
      if (validationSequence.current === sequence) setFile(selected);
    } catch (cause) {
      if (validationSequence.current !== sequence) return;
      setFile(null);
      setError(cause instanceof Error ? cause.message : "Choose a valid image");
    }
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("image", file);
      await api(
        `/teams/${encodeURIComponent(resource.teamId)}/resources/${encodeURIComponent(resource.id)}/image`,
        { method: "POST", body }
      );
      await onSaved();
      toast.success("Resource image updated");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource image could not be updated");
    } finally {
      setBusy(false);
    }
  }

  async function refreshFavicon() {
    setBusy(true);
    setError("");
    try {
      await api(
        `/teams/${encodeURIComponent(resource.teamId)}/resources/${encodeURIComponent(resource.id)}/favicon`,
        { method: "POST" }
      );
      await onSaved();
      toast.success("Favicon updated");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Favicon could not be updated");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeDisabled={busy}>
        <DialogHeader title="Resource image" />
        <form className="grid gap-5" onSubmit={upload}>
          <div className="flex justify-center">
            {preview ? (
              <span className="grid size-24 place-items-center overflow-hidden rounded-2xl bg-lavender-soft">
                <img alt="" className="size-full object-contain p-2" src={preview} />
              </span>
            ) : (
              <ResourceImage
                resource={resource}
                className="size-24 rounded-2xl"
                iconClassName="size-8"
              />
            )}
          </div>
          <Field>
            <FieldLabel htmlFor={inputId}>Image</FieldLabel>
            <Input
              id={inputId}
              type="file"
              accept={imageAssetAccept}
              disabled={busy}
              onChange={(event) => void chooseImage(event)}
              className="py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-lavender-soft file:px-3 file:py-1 file:text-xs file:font-semibold file:text-violet-strong"
            />
            <p className="text-xs text-muted">{imageAssetRequirements}</p>
          </Field>
          <FieldError>{error}</FieldError>
          <div className="flex flex-wrap justify-between gap-2">
            {resource.kind === "service" ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void refreshFavicon()}
              >
                <RefreshCw /> Update favicon
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="coral" disabled={busy || !file}>
                <Upload /> {busy ? "Saving…" : "Save image"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
