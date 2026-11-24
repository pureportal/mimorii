import { useLocale } from "../../lib/locale";
import { GermanTerms } from "./terms-de";
import { EnglishTerms } from "./terms-en";

export function TermsPage() {
  return useLocale().locale === "de" ? <GermanTerms /> : <EnglishTerms />;
}
