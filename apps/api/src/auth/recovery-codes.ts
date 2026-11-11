import { randomInt } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const CODE_LENGTH = 10;
const GROUP_LENGTH = 5;
const RECOVERY_CODE_COUNT = 10;
const NORMALIZED_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

export function createRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${code.slice(0, GROUP_LENGTH)}-${code.slice(GROUP_LENGTH)}`;
  });
}

export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .replace(/[\s-]/g, "")
    .replace(/o/g, "0")
    .replace(/[il]/g, "1");
  return NORMALIZED_PATTERN.test(normalized) ? normalized : null;
}
