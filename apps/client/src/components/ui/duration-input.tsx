import { useState } from "react";
import { Input, Select } from "./input";

const durationUnits = [
  { id: "seconds", label: "seconds", seconds: 1 },
  { id: "minutes", label: "minutes", seconds: 60 },
  { id: "hours", label: "hours", seconds: 3_600 },
  { id: "days", label: "days", seconds: 86_400 },
] as const;

type DurationUnit = (typeof durationUnits)[number];

export function DurationInput({
  id,
  name,
  label,
  defaultSeconds,
  minSeconds,
  maxSeconds,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultSeconds: number | null;
  minSeconds: number;
  maxSeconds: number;
  required?: boolean;
}) {
  const units = durationUnits.filter(
    (unit) => unit.seconds <= maxSeconds && (unit.seconds === 1 || unit.seconds >= minSeconds)
  );
  const [unit, setUnit] = useState<DurationUnit>(() => initialUnit(defaultSeconds, units));
  const [amount, setAmount] = useState(() =>
    defaultSeconds === null ? "" : String(defaultSeconds / unit.seconds)
  );
  const seconds = amount === "" ? "" : String(Math.round(Number(amount) * unit.seconds));

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min={minSeconds / unit.seconds}
        max={maxSeconds / unit.seconds}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        required={required}
        className="min-w-0 flex-1"
      />
      <Select
        aria-label={`${label} unit`}
        value={unit.id}
        onChange={(event) =>
          setUnit(units.find((candidate) => candidate.id === event.target.value)!)
        }
        className="w-32 shrink-0"
      >
        {units.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </Select>
      <input type="hidden" name={name} value={seconds} />
    </div>
  );
}

function initialUnit(seconds: number | null, units: readonly DurationUnit[]): DurationUnit {
  if (!seconds) return units.find((unit) => unit.id === "minutes") ?? units[0]!;
  return units.toReversed().find((unit) => seconds % unit.seconds === 0) ?? units[0]!;
}
