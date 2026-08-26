import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiBlob } from "../../lib/api";
import { ImageUploadField } from "../image-upload-field";
import { Button } from "../ui/button";

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

export function SponsorImageUpload({
  currentImage,
  disabled,
  onReadyChange,
  onSelectionChange,
}: SponsorImageUploadProps) {
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [validationError, setValidationError] = useState("");
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

  function selectFile(file: File | null) {
    setSelectedFile(file);
    setRemoveCurrent(false);
    onSelectionChange({ file, removeCurrent: false });
  }

  function resetValidation() {
    setValidationError("");
    onReadyChange(true);
  }

  function clearSelection() {
    setSelectedFile(null);
    setRemoveCurrent(false);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: false });
  }

  function removeImage() {
    setSelectedFile(null);
    setRemoveCurrent(true);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: true });
  }

  function undoRemoval() {
    setRemoveCurrent(false);
    resetValidation();
    onSelectionChange({ file: null, removeCurrent: false });
  }

  const hasCurrentImage = currentImage !== null;

  return (
    <div className="grid gap-1.5">
      <ImageUploadField
        label="Image"
        file={selectedFile}
        currentPreview={
          !removeCurrent && currentPreview ? (
            <img src={currentPreview} alt="" className="size-full object-contain p-1.5" />
          ) : undefined
        }
        idleStatus={
          removeCurrent
            ? "Image will be removed"
            : hasCurrentImage
              ? "Current image"
              : "No image selected"
        }
        disabled={disabled}
        uploading={disabled && Boolean(selectedFile)}
        validationError={validationError}
        onFileChange={selectFile}
        onReadyChange={onReadyChange}
        onValidationErrorChange={setValidationError}
      />
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
  );
}
