import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";
import { useLocale } from "../../lib/locale";

const email = <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>;

export function ImprintPage() {
  const { locale } = useLocale();

  if (locale === "de") {
    return (
      <LegalPage title="Impressum" showEffectiveDate={false}>
        <LegalSection title="Anbieter">
          <p>Angaben nach § 5 DDG:</p>
          <LegalAddress />
        </LegalSection>

        <ContactSection emailLabel="E-Mail" phoneLabel="Telefon" title="Kontakt" />

        <LegalSection title="Kontaktstelle nach dem Digital Services Act">
          <p>
            Behörden, die Europäische Kommission, das Europäische Gremium für digitale Dienste sowie
            Nutzerinnen und Nutzer können uns nach Artikel 11 und 12 der Verordnung (EU) 2022/2065
            unter {email} erreichen. Die Kommunikation ist auf Deutsch und Englisch möglich.
          </p>
        </LegalSection>

        <LegalSection title="Meldung rechtswidriger Inhalte">
          <p>
            Meldungen nach Artikel 16 der Verordnung (EU) 2022/2065 können an {email} gesendet
            werden. Geben Sie die genaue URL der öffentlichen Statusseite oder des Dashboards an,
            begründen Sie nachvollziehbar, warum der Inhalt rechtswidrig sein soll, nennen Sie Ihren
            Namen und Ihre E-Mail-Adresse, sofern Artikel 16 keine anonyme Meldung zulässt, und
            erklären Sie, dass Sie die Angaben in der Meldung für richtig und vollständig halten.
            PurePortal bestätigt den Eingang und teilt seine Entscheidung samt Begründung mit,
            soweit dies gesetzlich vorgeschrieben ist.
          </p>
        </LegalSection>
      </LegalPage>
    );
  }

  return (
    <LegalPage title="Imprint" showEffectiveDate={false}>
      <LegalSection title="Provider">
        <p>Information under Section 5 DDG:</p>
        <LegalAddress />
      </LegalSection>

      <ContactSection emailLabel="Email" phoneLabel="Phone" title="Contact" />

      <LegalSection title="Digital Services Act contact point">
        <p>
          Authorities, the European Commission, the European Board for Digital Services, and users
          may contact us under Articles 11 and 12 of Regulation (EU) 2022/2065 at {email}.
          Communication is accepted in German and English.
        </p>
      </LegalSection>

      <LegalSection title="Notices of illegal content">
        <p>
          Notices under Article 16 of Regulation (EU) 2022/2065 may be sent to {email}. Include the
          exact public status-page or dashboard URL, a clear explanation of why the content is
          alleged to be illegal, your name and email address unless Article 16 permits an anonymous
          notice, and a statement that you believe the information in the notice is accurate and
          complete. PurePortal will confirm receipt and communicate its decision and reasons where
          required by law.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

function ContactSection({
  title,
  emailLabel,
  phoneLabel,
}: {
  title: string;
  emailLabel: string;
  phoneLabel: string;
}) {
  return (
    <LegalSection title={title}>
      <p>
        {emailLabel}: {email}
        <br />
        {phoneLabel}:{" "}
        <a href={`tel:${legalProvider.phone.replaceAll(" ", "")}`}>{legalProvider.phone}</a>
        <br />
        Website: <a href={legalProvider.website}>{legalProvider.website}</a>
      </p>
    </LegalSection>
  );
}
