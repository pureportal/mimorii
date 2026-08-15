import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";

export function ImprintPage() {
  return (
    <LegalPage title="Imprint" showEffectiveDate={false}>
      <LegalSection title="Provider">
        <p>Information pursuant to Section 5 of the German Digital Services Act (DDG):</p>
        <LegalAddress />
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email: <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>
          <br />
          Phone:{" "}
          <a href={`tel:${legalProvider.phone.replaceAll(" ", "")}`}>{legalProvider.phone}</a>
          <br />
          Website: <a href={legalProvider.website}>{legalProvider.website}</a>
        </p>
      </LegalSection>

      <LegalSection title="Digital Services Act contact point">
        <p>
          Authorities, the European Commission, the European Board for Digital Services, and users
          may contact us under Articles 11 and 12 of Regulation (EU) 2022/2065 at{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. Communication is
          accepted in German and English.
        </p>
      </LegalSection>

      <LegalSection title="Notices of illegal content">
        <p>
          Notices under Article 16 of Regulation (EU) 2022/2065 may be sent to{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. Include the exact
          public status-page or dashboard URL, a clear explanation of why the content is alleged to
          be illegal, your name and email address unless Article 16 permits an anonymous notice, and
          a statement that you believe the information in the notice is accurate and complete.
          PurePortal will confirm receipt and communicate its decision and reasons where required by
          law.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
