import type { TeamSummary } from "@mimorii/contracts";
import { ImageUploadField } from "./image-upload-field";
import { TeamLogo } from "./team-logo";

export function TeamLogoField({
  team,
  name,
  file,
  disabled,
  uploading,
  validationError,
  onFileChange,
  onInteraction,
  onReadyChange,
  onValidationErrorChange,
}: {
  team?: Pick<TeamSummary, "id" | "name" | "logoUpdatedAt">;
  name: string;
  file: File | null;
  disabled: boolean;
  uploading: boolean;
  validationError: string;
  onFileChange: (file: File | null) => void;
  onInteraction: () => void;
  onReadyChange: (ready: boolean) => void;
  onValidationErrorChange: (message: string) => void;
}) {
  const hasCurrentLogo = typeof team?.logoUpdatedAt === "string";

  return (
    <ImageUploadField
      label="Logo"
      file={file}
      currentPreview={
        <TeamLogo
          team={team ?? { id: "", name, logoUpdatedAt: null }}
          className="size-full rounded-xl text-lg"
          iconClassName="size-7"
        />
      }
      idleStatus={hasCurrentLogo ? "Current logo" : "No logo selected"}
      disabled={disabled}
      uploading={uploading}
      validationError={validationError}
      onFileChange={onFileChange}
      onInteraction={onInteraction}
      onReadyChange={onReadyChange}
      onValidationErrorChange={onValidationErrorChange}
    />
  );
}
