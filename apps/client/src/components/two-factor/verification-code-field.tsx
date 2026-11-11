import { useRef } from "react";
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

const AUTHENTICATOR_CODE_LENGTH = 6;

export function VerificationCodeField({
  id,
  value,
  onChange,
  recovery = false,
  onRecoveryChange,
  autoFocus = false,
  onComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recovery?: boolean;
  onRecoveryChange?: (recovery: boolean) => void;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function change(next: string) {
    if (recovery) {
      onChange(next);
      return;
    }
    const digits = next.replace(/\D/g, "").slice(0, AUTHENTICATOR_CODE_LENGTH);
    onChange(digits);
    if (digits.length === AUTHENTICATOR_CODE_LENGTH && digits !== value) onComplete?.(digits);
  }

  function toggleRecovery() {
    onChange("");
    onRecoveryChange?.(!recovery);
    inputRef.current?.focus();
  }

  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{recovery ? "Recovery code" : "Authentication code"}</FieldLabel>
        {onRecoveryChange ? (
          <button
            type="button"
            className="text-xs font-semibold text-violet-strong hover:underline"
            onClick={toggleRecovery}
          >
            {recovery ? "Use authenticator app" : "Use a recovery code"}
          </button>
        ) : null}
      </div>
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => change(event.target.value)}
        autoComplete={recovery ? "off" : "one-time-code"}
        inputMode={recovery ? "text" : "numeric"}
        pattern={recovery ? undefined : `\\d{${AUTHENTICATOR_CODE_LENGTH}}`}
        maxLength={recovery ? 32 : undefined}
        autoCapitalize="none"
        spellCheck={false}
        className="font-mono tracking-[0.2em]"
        required
        autoFocus={autoFocus}
      />
    </Field>
  );
}
