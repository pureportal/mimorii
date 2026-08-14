import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";
import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <LegalSection title="1. Provider and scope">
        <p>
          These Terms govern use of Mimorii provided by Andreas Ehrhardt, trading as PurePortal:
        </p>
        <LegalAddress />
        <p>
          Contact: <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. They apply
          to the hosted service offered by PurePortal. If an independent operator hosts Mimorii,
          that operator must provide its own contractual terms.
        </p>
      </LegalSection>

      <LegalSection title="2. Contract and account">
        <p>
          A contract is formed when a user submits the registration form after accepting these Terms
          and PurePortal creates the account. Mimorii is currently provided without a usage fee. No
          paid plan or automatic renewal is part of these Terms.
        </p>
        <p>
          Registration is available in English. Users can review and correct their entries before
          selecting Create account. Account creation and immediate access confirm the contract.
          These Terms can be opened, printed, or saved before registration. PurePortal records the
          accepted Terms version and time but does not provide a separate stored contract document
          for later retrieval.
        </p>
        <p>
          Users must provide accurate account information, keep credentials and access tokens
          confidential, and notify PurePortal promptly of suspected misuse. Accounts may not be
          shared. A user who creates a team acts as its owner and is responsible for assigning
          appropriate roles.
        </p>
      </LegalSection>

      <LegalSection title="3. Service">
        <p>
          Mimorii monitors configured HTTP, TCP, and DNS targets, receives agent and heartbeat
          measurements, keeps monitoring history, manages incidents and maintenance, delivers
          configured notifications, and can publish status pages and monitoring dashboards. The
          exact functions available depend on the deployment and configuration.
        </p>
        <p>
          Monitoring results and notifications can be delayed, incomplete, or incorrect. Mimorii is
          not an emergency alert system and must not be the sole safeguard for safety-critical or
          legally required monitoring.
        </p>
      </LegalSection>

      <LegalSection title="4. Permitted monitoring and agents">
        <p>
          Users may monitor only systems, domains, ports, networks, and data for which they have
          authorization. They must comply with applicable law and third-party terms. Mimorii must
          not be used for unauthorized scanning, access attempts, surveillance, disruption, or to
          bypass technical restrictions.
        </p>
        <p>
          Users are responsible for installing agents securely, protecting enrollment and heartbeat
          secrets, choosing appropriate permissions, and reviewing the measurements an agent sends
          before deployment.
        </p>
      </LegalSection>

      <LegalSection title="5. Team and public content">
        <p>
          Team owners and administrators control membership, configured recipients, webhooks,
          resources, incidents, status pages, dashboards, and their access settings. Public links
          are accessible to anyone who obtains them, including access-key-protected dashboard links.
          Users remain responsible for the legality, accuracy, confidentiality, and rights in
          content they enter, publish, or share.
        </p>
        <p>
          Users grant PurePortal a non-exclusive right to host, reproduce, transmit, and display
          their content only as necessary to operate Mimorii. This right ends when the content is
          deleted, except where temporary backups or legal retention duties apply.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <ul>
          <li>Do not use Mimorii for unlawful, fraudulent, abusive, or harmful activity.</li>
          <li>Do not interfere with the service or circumvent access or rate limits.</li>
          <li>Do not upload malicious code or content that infringes third-party rights.</li>
          <li>Do not expose personal data through public pages without a lawful basis.</li>
        </ul>
        <p>
          PurePortal may restrict harmful activity or suspend affected access where necessary to
          protect users, third parties, or the service. Where practicable, the user will be informed
          and given an opportunity to remedy the issue.
        </p>
        <p>
          PurePortal does not proactively monitor customer content or use automated content
          moderation decisions. Specific content may be reviewed manually after a notice or where
          necessary for security or legal compliance. Restrictions are applied diligently,
          objectively, and proportionately. Where required by law, the affected user receives the
          reasons and available means of redress and may ask support to review the decision.
        </p>
      </LegalSection>

      <LegalSection title="7. Data protection">
        <p>
          The <Link to="/privacy">Privacy policy</Link> explains PurePortal&apos;s processing as a
          controller. A team that enters personal data into monitoring configurations, team content,
          notifications, or public status pages is responsible for its own lawful basis and
          transparency duties.
        </p>
        <p>
          Where PurePortal processes such data solely on a customer&apos;s documented instructions,
          the parties must conclude the data processing agreement required by Article 28 GDPR before
          that processing begins. Contact{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a> to arrange it.
        </p>
      </LegalSection>

      <LegalSection title="8. Availability and changes">
        <p>
          PurePortal may maintain, secure, or develop the service and may change or discontinue
          functions for a legitimate reason. Reasonable advance notice will be given for a material
          reduction where practicable. Statutory warranty rights remain unaffected.
        </p>
      </LegalSection>

      <LegalSection title="9. Termination">
        <p>
          Users may stop using Mimorii at any time. Team owners can delete a team in team settings;
          account deletion can be requested at{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. PurePortal may
          terminate an account on reasonable notice and may terminate or suspend immediately for a
          material breach or an urgent security or legal risk.
        </p>
        <p>
          On termination, access ends and data is deleted subject to the retention rules in the
          Privacy policy and mandatory legal obligations. Users should retain any information they
          need before deletion.
        </p>
      </LegalSection>

      <LegalSection title="10. Liability">
        <p>
          PurePortal is liable without limitation for intent and gross negligence, for injury to
          life, body, or health, under the German Product Liability Act, and where a guarantee was
          expressly given. For simple negligence, PurePortal is liable only for breach of an
          essential contractual obligation and only up to the foreseeable damage typical for this
          contract. Otherwise, liability for simple negligence is excluded. Mandatory statutory
          liability and consumer rights remain unaffected.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to these Terms">
        <p>
          Changes apply prospectively. PurePortal will present material changes before they take
          effect and request renewed acceptance where legally required. Continued use alone will not
          replace consent where consent is required by law.
        </p>
      </LegalSection>

      <LegalSection title="12. Governing law">
        <p>
          German law applies, excluding the UN Convention on Contracts for the International Sale of
          Goods. For consumers, this choice does not remove mandatory protections of the country in
          which they habitually reside. Statutory rules on jurisdiction apply; for merchants and
          public-law entities, the courts at the provider&apos;s registered place of business have
          jurisdiction where permitted.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
