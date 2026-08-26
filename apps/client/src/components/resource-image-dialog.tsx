import type { ResourceFaviconRefresh, ResourceSummary } from "@mimorii/contracts";
import { LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, api } from "../lib/api";
import { ImageUploadField } from "./image-upload-field";
import { ResourceImage } from "./resource-image";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { FieldError } from "./ui/field";

type ImageOperation = "idle" | "refreshing" | "uploading";

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
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState("");
  const [imageReady, setImageReady] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [operation, setOperation] = useState<ImageOperation>("idle");
  const busy = operation !== "idle";

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setValidationError("");
    setImageReady(true);
    setUploadError("");
    setRefreshError("");
    setOperation("idle");
  }, [open]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !imageReady) return;
    setOperation("uploading");
    setUploadError("");
    setRefreshError("");
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
      setUploadError(uploadFailureMessage(cause, "Image upload failed. Try again."));
    } finally {
      setOperation("idle");
    }
  }

  async function refreshFavicon() {
    setOperation("refreshing");
    setUploadError("");
    setRefreshError("");
    try {
      const result = await api<ResourceFaviconRefresh>(
        `/teams/${encodeURIComponent(resource.teamId)}/resources/${encodeURIComponent(resource.id)}/favicon`,
        { method: "POST" }
      );
      if (result.status === "updated") {
        await onSaved();
        toast.success("Favicon updated");
      } else {
        toast.success("Favicon retrieval queued");
      }
      onOpenChange(false);
    } catch (cause) {
      setRefreshError(uploadFailureMessage(cause, "Favicon update failed. Try again."));
    } finally {
      setOperation("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeDisabled={busy}>
        <DialogHeader title="Resource image" />
        <form className="grid gap-5" onSubmit={upload}>
          <ImageUploadField
            label="Image"
            file={file}
            currentPreview={
              <ResourceImage
                resource={resource}
                className="size-full rounded-xl"
                iconClassName="size-7"
              />
            }
            idleStatus={resource.imageUpdatedAt ? "Current image" : "No image selected"}
            disabled={busy}
            uploading={operation === "uploading"}
            validationError={validationError}
            failureError={uploadError}
            onFileChange={setFile}
            onInteraction={() => {
              setUploadError("");
              setRefreshError("");
            }}
            onReadyChange={setImageReady}
            onValidationErrorChange={setValidationError}
          />
          <FieldError>{refreshError ? <span role="alert">{refreshError}</span> : null}</FieldError>
          <div className="flex flex-wrap justify-between gap-2">
            {resource.kind === "service" ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void refreshFavicon()}
              >
                <RefreshCw
                  className={
                    operation === "refreshing"
                      ? "animate-spin motion-reduce:animate-none"
                      : undefined
                  }
                />
                {operation === "refreshing" ? "Updating…" : "Update favicon"}
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
              <Button type="submit" variant="coral" disabled={busy || !file || !imageReady}>
                {operation === "uploading" ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Upload />
                )}
                {operation === "uploading" ? "Uploading…" : "Save image"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function uploadFailureMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError && cause.status < 500 ? cause.message : fallback;
}
