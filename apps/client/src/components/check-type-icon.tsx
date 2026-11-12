import type { CheckType } from "@mimorii/contracts";
import { checkTypeIcons } from "../lib/check-types";

export function CheckTypeIcon({ type, className }: { type: CheckType; className?: string }) {
  const Icon = checkTypeIcons[type];
  return <Icon className={className} />;
}
