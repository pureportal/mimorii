import { useLocale } from "../../lib/locale";
import { GermanPrivacyPolicy } from "./privacy-policy-de";
import { EnglishPrivacyPolicy } from "./privacy-policy-en";

export function PrivacyPage() {
  return useLocale().locale === "de" ? <GermanPrivacyPolicy /> : <EnglishPrivacyPolicy />;
}
