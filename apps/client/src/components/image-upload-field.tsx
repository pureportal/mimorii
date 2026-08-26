import { Check, ImageIcon, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import {
  imageAssetAccept,
  imageAssetRequirements,
  validateImageAssetSelection,
} from "../lib/image-asset";
import { Field, FieldError, FieldLabel } from "./ui/field";

type DragState = "idle" | "accepted" | "rejected";
type UploadState = DragState | "error" | "processing" | "ready" | "uploading";

interface ImageUploadFieldProps {
  label: string;
  file: File | null;
  currentPreview?: ReactNode;
  idleStatus: string;
  disabled?: boolean;
  uploading?: boolean;
  validationError: string;
  failureError?: string;
  onFileChange: (file: File | null) => void;
  onInteraction?: () => void;
  onReadyChange: (ready: boolean) => void;
  onValidationErrorChange: (message: string) => void;
}

export function ImageUploadField({
  label,
  file,
  currentPreview,
  idleStatus,
  disabled = false,
  uploading = false,
  validationError,
  failureError = "",
  onFileChange,
  onInteraction,
  onReadyChange,
  onValidationErrorChange,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const requirementsId = `${inputId}-requirements`;
  const errorId = `${inputId}-error`;
  const error = validationError || failureError;
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragState, setDragState] = useState<DragState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const validationSequence = useRef(0);
  const visibleError = dragState === "idle" ? error : "";

  useEffect(
    () => () => {
      validationSequence.current += 1;
    },
    []
  );

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function chooseFiles(files: File[]) {
    if (files.length === 0) return;
    const sequence = ++validationSequence.current;
    setDragState("idle");
    setProcessing(true);
    onInteraction?.();
    onValidationErrorChange("");
    onReadyChange(false);
    onFileChange(null);
    try {
      const selected = await validateImageAssetSelection(files);
      if (validationSequence.current !== sequence) return;
      onFileChange(selected);
      onReadyChange(true);
    } catch (cause) {
      if (validationSequence.current !== sequence) return;
      onValidationErrorChange(cause instanceof Error ? cause.message : "Choose a valid image");
    } finally {
      if (validationSequence.current === sequence) setProcessing(false);
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void chooseFiles(files);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    inputRef.current?.blur();
    dragDepth.current += 1;
    setDragState(draggedFileState(event.dataTransfer.items));
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
    setDragState(draggedFileState(event.dataTransfer.items));
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragState("idle");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragState("idle");
    if (disabled) return;
    void chooseFiles(Array.from(event.dataTransfer.files));
  }

  const state: UploadState = uploading
    ? "uploading"
    : processing
      ? "processing"
      : dragState !== "idle"
        ? dragState
        : error
          ? "error"
          : file
            ? "ready"
            : "idle";
  const stateContent = uploadStateContent(state, file, idleStatus, Boolean(failureError));
  const StateIcon = stateContent.icon;

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={imageAssetAccept}
        aria-label={label}
        aria-describedby={`${requirementsId}${visibleError ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(visibleError)}
        className="peer sr-only"
        disabled={disabled}
        onChange={handleInput}
      />
      <label
        htmlFor={inputId}
        aria-busy={processing || uploading}
        aria-disabled={disabled}
        data-upload-state={state}
        className={cn(
          "relative grid min-h-30 cursor-pointer grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 overflow-hidden rounded-2xl border border-dashed border-line bg-ink/[0.018] p-4 outline-none transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-lavender hover:bg-lavender-soft/30 peer-focus-visible:border-coral-strong peer-focus-visible:ring-2 peer-focus-visible:ring-coral/35 motion-reduce:transform-none motion-reduce:transition-none",
          state === "ready" && "border-success/55 bg-success/[0.045]",
          state === "accepted" &&
            "scale-[1.01] border-success bg-success/[0.08] ring-2 ring-success/20",
          (state === "rejected" || state === "error") &&
            "border-danger bg-danger/[0.055] ring-2 ring-danger/15",
          (state === "processing" || state === "uploading") &&
            "border-lavender bg-lavender-soft/45",
          disabled && "pointer-events-none",
          disabled && !uploading && "opacity-60"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <span className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-muted shadow-sm">
          {preview ? (
            <img
              key={preview}
              src={preview}
              alt=""
              className="size-full animate-fade-in object-contain p-1.5 motion-reduce:animate-none"
            />
          ) : (
            (currentPreview ?? <ImageIcon aria-hidden="true" className="size-6" />)
          )}
        </span>
        <span className="min-w-0">
          <span
            className="flex items-center gap-2 text-sm font-semibold text-ink"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <StateIcon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                state === "ready" || state === "accepted"
                  ? "text-success-strong"
                  : state === "error" || state === "rejected"
                    ? "text-danger"
                    : "text-violet-strong",
                (state === "processing" || state === "uploading") &&
                  "animate-spin motion-reduce:animate-none"
              )}
            />
            {stateContent.title}
          </span>
          {stateContent.detail ? (
            <span className="mt-1 block truncate text-xs text-muted">{stateContent.detail}</span>
          ) : null}
          <span id={requirementsId} className="mt-1 block text-xs text-muted">
            {imageAssetRequirements}
          </span>
        </span>
        {state === "uploading" ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-lavender/10"
          >
            <span className="block h-full w-1/3 animate-[upload-progress_1.1s_ease-in-out_infinite] rounded-full bg-lavender motion-reduce:animate-none" />
          </span>
        ) : null}
      </label>
      <FieldError>
        {visibleError ? (
          <span id={errorId} role="alert">
            {visibleError}
          </span>
        ) : null}
      </FieldError>
    </Field>
  );
}

function draggedFileState(items: DataTransferItemList): DragState {
  const files = Array.from(items).filter((item) => item.kind === "file");
  if (files.length !== 1) return "rejected";
  const type = files[0]!.type;
  return !type || imageAssetAccept.split(",").includes(type) ? "accepted" : "rejected";
}

function uploadStateContent(
  state: UploadState,
  file: File | null,
  idleStatus: string,
  uploadFailed: boolean
): { title: string; detail?: string; icon: typeof Upload } {
  switch (state) {
    case "accepted":
      return { title: "Drop to use image", icon: Upload };
    case "rejected":
      return {
        title: "Choose one supported image",
        icon: TriangleAlert,
      };
    case "processing":
      return { title: "Checking image…", icon: LoaderCircle };
    case "uploading":
      return { title: "Uploading image…", detail: file?.name ?? "Please wait", icon: LoaderCircle };
    case "error":
      return uploadFailed
        ? { title: "Upload failed", detail: file?.name ?? "Selected image", icon: TriangleAlert }
        : { title: "Choose another image", icon: TriangleAlert };
    case "ready":
      return { title: "Image ready", detail: file?.name ?? "Selected image", icon: Check };
    default:
      return { title: "Drop image or browse", detail: idleStatus, icon: Upload };
  }
}
