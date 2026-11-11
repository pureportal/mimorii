import { logIngestionLimits, logLabelNamePattern } from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";

export const reservedLogLabel = "level";

const nullCharacter = String.fromCharCode(0);
const replacementCharacter = String.fromCharCode(0xfffd);

export function validateLogLabels(labels: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(labels);
  if (entries.length > logIngestionLimits.labelsPerStream) {
    throw new BadRequestException(
      `Streams can have up to ${logIngestionLimits.labelsPerStream} labels`
    );
  }
  const validated: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!logLabelNamePattern.test(name)) {
      throw new BadRequestException(
        `Label "${name.slice(0, 64)}" must start with a letter or underscore and contain only letters, digits, and underscores`
      );
    }
    if (typeof value !== "string" || !value || value.length > logIngestionLimits.labelValueLength) {
      throw new BadRequestException(
        `Label "${name}" needs a value with 1 to ${logIngestionLimits.labelValueLength} characters`
      );
    }
    validated[name] = withoutNullCharacters(value);
  }
  return validated;
}

export function logLabelsKey(labels: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(labels)
      .toSorted()
      .map((name) => [name, labels[name]])
  );
}

export function withoutNullCharacters(value: string): string {
  return value.includes(nullCharacter)
    ? value.replaceAll(nullCharacter, replacementCharacter)
    : value;
}
