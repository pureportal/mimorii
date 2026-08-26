import type { TeamSummary } from "@mimorii/contracts";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { imageAssetAccept, imageAssetRequirements, validateImageAsset } from "../lib/image-asset";
import { TeamLogo } from "./team-logo";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function TeamLogoField({
  team,
  name,
  file,
  disabled,
  onFileChange,
  onError,
}: {
  team?: Pick<TeamSummary, "id" | "name" | "logoUpdatedAt">;
  name: string;
  file: File | null;
  disabled: boolean;
  onFileChange: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const validationSequence = useRef(0);

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

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    const sequence = ++validationSequence.current;
    onError("");
    onFileChange(null);
    if (!selected) return;
    try {
      await validateImageAsset(selected);
      if (validationSequence.current === sequence) onFileChange(selected);
    } catch (cause) {
      if (validationSequence.current !== sequence) return;
      onError(cause instanceof Error ? cause.message : "Choose a valid image");
    }
  }

  return (
    <>
      <div className="flex justify-center">
        {preview ? (
          <span className="grid size-24 place-items-center overflow-hidden rounded-2xl bg-lavender-soft">
            <img alt="" className="size-full object-contain p-2" src={preview} />
          </span>
        ) : (
          <TeamLogo
            team={team ?? { id: "", name, logoUpdatedAt: null }}
            className="size-24 rounded-2xl text-2xl"
            iconClassName="size-8"
          />
        )}
      </div>
      <Field>
        <FieldLabel htmlFor={inputId}>Logo</FieldLabel>
        <Input
          id={inputId}
          type="file"
          accept={imageAssetAccept}
          disabled={disabled}
          onChange={(event) => void chooseLogo(event)}
          className="py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-lavender-soft file:px-3 file:py-1 file:text-xs file:font-semibold file:text-violet-strong"
        />
        <p className="text-xs text-muted">{imageAssetRequirements}</p>
      </Field>
    </>
  );
}
