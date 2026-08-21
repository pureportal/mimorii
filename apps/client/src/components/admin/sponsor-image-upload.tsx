import { ImageIcon, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { apiBlob } from "../../lib/api";
import { cn } from "../../lib/cn";
import {
  imageAssetAccept,
  imageAssetRequirements,
  validateImageAsset,
} from "../../lib/image-asset";
import { Button } from "../ui/button";
import { Field, FieldError, FieldLabel } from "../ui/field";

export interface SponsorImageSelection {
  file: File | null;
  removeCurrent: boolean;
}

interface CurrentSponsorImage {
  sponsorId: string;
  updatedAt: string;
}

interface SponsorImageUploadProps {
  currentImage: CurrentSponsorImage | null;
  disabled: boolean;
  onReadyChange: (ready: boolean) => void;
  onSelectionChange: (selection: SponsorImageSelection) => void;
}

type DragState = "idle" | "accepted" | "rejected";

export function SponsorImageUpload({
  currentImage,
  disabled,
  onReadyChange,
  onSelectionChange,
}: SponsorImageUploadProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const requirementsId = `${inputId}-requirements`;
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragState, setDragState] = useState<DragState>("idle");
  const [error, setError] = useState("");
  const selectedPreviewRef = useRef<string | null>(null);
  const validationSequence = useRef(0);
  const currentSponsorId = currentImage?.sponsorId ?? null;
  const currentImageUpdatedAt = currentImage?.updatedAt ?? null;

  useEffect(() => {
    if (!currentSponsorId || !currentImageUpdatedAt) return undefined;
    const controller = new AbortController();
    let active = true;
    let previewUrl: string | null = null;
    void apiBlob(
      `/admin/sponsors/${encodeURIComponent(currentSponsorId)}/favicon?v=${encodeURIComponent(currentImageUpdatedAt)}`,
      { signal: controller.signal }
    )
      .then((image) => {
        if (!active) return;
        previewUrl = URL.createObjectURL(image);
        setCurrentPreview(previewUrl);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setCurrentPreview(null);
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [currentImageUpdatedAt, currentSponsorId]);

  useEffect(
    () => () => {
      validationSequence.current += 1;
      if (selectedPreviewRef.current) URL.revokeObjectURL(selectedPreviewRef.current);
    },
    []
  );

  async function chooseFiles(files: File[]) {
    const sequence = ++validationSequence.current;
    if (files.length !== 1) {
      setProcessing(false);
      setError("Choose one image");
      setDragState("rejected");
      onReadyChange(false);
      return;
    }

    setProcessing(true);
    setError("");
    onReadyChange(false);
    try {
      await validateImageAsset(files[0]!);
      if (validationSequence.current !== sequence) return;
      replaceSelectedFile(files[0]!);
      setRemoveCurrent(false);
      setDragState("idle");
      onSelectionChange({ file: files[0]!, removeCurrent: false });
      onReadyChange(true);
    } catch (cause) {
      if (validationSequence.current !== sequence) return;
      setError(cause instanceof Error ? cause.message : "Choose a valid image");
      setDragState("rejected");
      onReadyChange(false);
    } finally {
      if (validationSequence.current === sequence) setProcessing(false);
    }
  }

  function replaceSelectedFile(file: File | null) {
    if (selectedPreviewRef.current) URL.revokeObjectURL(selectedPreviewRef.current);
    const preview = file ? URL.createObjectURL(file) : null;
    selectedPreviewRef.current = preview;
    setSelectedFile(file);
    setSelectedPreview(preview);
  }

  function resetValidation() {
    validationSequence.current += 1;
    setProcessing(false);
    setError("");
    setDragState("idle");
    onReadyChange(true);
  }

  function clearSelection() {
    replaceSelectedFile(null);
    setRemoveCurrent(false);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: false });
  }

  function removeImage() {
    replaceSelectedFile(null);
    setRemoveCurrent(true);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: true });
  }

  function undoRemoval() {
    setRemoveCurrent(false);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: false });
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void chooseFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
    const fileItems = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
    setDragState(
      fileItems.length === 1 && imageAssetAccept.split(",").includes(fileItems[0]!.type)
        ? "accepted"
        : "rejected"
    );
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragState("idle");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) return;
    void chooseFiles(Array.from(event.dataTransfer.files));
  }

  const preview = selectedPreview ?? (!removeCurrent ? currentPreview : null);
  const hasCurrentImage = currentImage !== null;
  const stateLabel = processing
    ? "Checking image…"
    : selectedFile
      ? selectedFile.name
      : removeCurrent
        ? "Image will be removed"
        : hasCurrentImage
          ? "Current image"
          : "No image selected";

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Image</FieldLabel>
      <input
        id={inputId}
        type="file"
        accept={imageAssetAccept}
        aria-label="Image"
        aria-describedby={`${requirementsId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        className="peer sr-only"
        disabled={disabled}
        onChange={handleInput}
      />
      <label
        htmlFor={inputId}
        aria-disabled={disabled}
        className={cn(
          "grid min-h-28 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-dashed border-line bg-ink/[0.015] p-4 outline-none transition hover:border-lavender hover:bg-lavender-soft/35 peer-focus-visible:border-coral-strong peer-focus-visible:ring-2 peer-focus-visible:ring-coral/35",
          dragState === "accepted" && "border-success bg-success/8 ring-2 ring-success/20",
          dragState === "rejected" && "border-danger bg-danger/6 ring-2 ring-danger/15",
          disabled && "pointer-events-none opacity-55"
        )}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-muted shadow-sm">
          {preview ? (
            <img src={preview} alt="" className="size-full object-contain p-1.5" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-6" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Upload aria-hidden="true" className="size-4 shrink-0 text-violet-strong" />
            Drop image or browse
          </span>
          <span className="mt-1 block truncate text-xs text-muted" aria-live="polite">
            {stateLabel}
          </span>
          <span id={requirementsId} className="mt-1 block text-xs text-muted">
            {imageAssetRequirements}
          </span>
        </span>
      </label>
      {error || selectedFile || hasCurrentImage || removeCurrent ? (
        <div className="flex items-start justify-between gap-3">
          <FieldError>
            {error ? (
              <span id={errorId} role="alert">
                {error}
              </span>
            ) : null}
          </FieldError>
          {selectedFile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              disabled={disabled}
              onClick={clearSelection}
            >
              <RotateCcw /> Clear selection
            </Button>
          ) : hasCurrentImage && !removeCurrent ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0 text-danger"
              disabled={disabled}
              onClick={removeImage}
            >
              <Trash2 /> Remove image
            </Button>
          ) : removeCurrent ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              disabled={disabled}
              onClick={undoRemoval}
            >
              <RotateCcw /> Undo removal
            </Button>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}
