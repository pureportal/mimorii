import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../../lib/locale";
import { ImprintPage } from "./imprint-page";
import { PrivacyPage } from "./privacy-page";
import { TermsPage } from "./terms-page";

function renderAt(path: string, page: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider>{page}</LocaleProvider>
    </MemoryRouter>
  );
}

describe("legal pages", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each([
    ["/privacy", <PrivacyPage key="privacy" />, "Privacy policy"],
    ["/terms", <TermsPage key="terms" />, "Terms of Use"],
    ["/imprint", <ImprintPage key="imprint" />, "Imprint"],
  ])("renders %s in English by default", (path, page, title) => {
    renderAt(path, page);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it.each([
    ["/privacy", <PrivacyPage key="privacy" />, "Datenschutzerklärung", "9. Ihre Rechte"],
    ["/terms", <TermsPage key="terms" />, "Nutzungsbedingungen", "10. Haftung"],
    ["/imprint", <ImprintPage key="imprint" />, "Impressum", "Kontakt"],
  ])("renders %s in German with language alternates", (path, page, title, section) => {
    window.localStorage.setItem("mimorii.locale", "de");
    renderAt(path, page);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    expect(screen.getAllByText(/handelnd unter PurePortal/).length).toBeGreaterThan(0);
    expect(document.head.querySelector('link[hreflang="de"]')).toHaveAttribute(
      "href",
      `${window.location.origin}${path}?lang=de`
    );
    expect(document.head.querySelector('link[hreflang="x-default"]')).toHaveAttribute(
      "href",
      `${window.location.origin}${path}`
    );
  });
});
