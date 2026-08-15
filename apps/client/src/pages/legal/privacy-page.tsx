import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import type { ReactNode } from "react";
import { analyticsConfigured, sessionReplayConfigured } from "../../lib/privacy-preferences";
import { legalProvider } from "../../lib/legal";

const customSwetrixEndpoint = import.meta.env.VITE_SWETRIX_API_URL?.trim();
const purePortalSwetrix = swetrixHostname(customSwetrixEndpoint) === "swetrix.pureportal.io";

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <LegalSection title="1. Scope and responsibility">
        <p>
          This policy describes personal-data processing in the Mimorii service operated by Andreas
          Ehrhardt, trading as PurePortal. For this website, account administration, support,
          sponsorship applications, service security, and optional analytics, PurePortal is the
          controller under the General Data Protection Regulation (GDPR).
        </p>
        <p>
          Organizations using Mimorii decide which systems, team members, notification recipients,
          and status content they enter. For personal data PurePortal handles solely on their
          instructions, the organization is the controller and PurePortal acts as processor. A data
          processing agreement under Article 28 GDPR is required before such processing begins.
        </p>
        <p>
          Mimorii can also be self-hosted and connected to a server selected by the user. An
          independent server operator is responsible for that deployment and must provide its own
          privacy information. PurePortal does not receive data from an independently hosted
          installation merely because the Mimorii software is used.
        </p>
      </LegalSection>

      <LegalSection title="2. Controller">
        <LegalAddress />
        <p>
          Email: <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>
          <br />
          Phone:{" "}
          <a href={`tel:${legalProvider.phone.replaceAll(" ", "")}`}>{legalProvider.phone}</a>
        </p>
      </LegalSection>

      <LegalSection title="3. Processing in Mimorii">
        <ProcessingEntry title="Service delivery and security" legalBasis="Article 6(1)(f) GDPR">
          <p>
            A server and its network infrastructure necessarily receive connection data such as IP
            address, request time, requested path, and browser or client information. Mimorii does
            not create application-level access logs. Infrastructure logging, hosting recipients,
            and their retention period depend on the deployment and must be identified by its
            operator. The legitimate interests are secure, reliable delivery and abuse prevention.
          </p>
        </ProcessingEntry>

        <ProcessingEntry title="Accounts and teams" legalBasis="Articles 6(1)(b) and 6(1)(f) GDPR">
          <p>
            Registration stores name, email address, a password hash, account timestamps, the
            accepted Terms version and time, team membership and roles, administrator status,
            account-disabled time, and last sign-in time. Login creates a signed session lasting up
            to 12 hours. Team invitations store the invited email, role, inviter, and a hashed
            token. Authorized global administrators can search account names and email addresses and
            see account, sign-in, team-count, and API-token-count metadata to administer access and
            security. The contract basis covers account and team functions; the legitimate interest
            covers proof of acceptance, account security, and platform administration.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Customer-controlled service data"
          legalBasis="Organization as controller; PurePortal as Article 28 processor"
        >
          <p>
            Teams decide which resource names, targets, check settings, tags, results, errors,
            incidents, maintenance, objectives, notification recipients, webhooks, and public status
            and dashboard content Mimorii processes. The organization must determine its legal
            basis, provide the required privacy information, and issue lawful instructions.
            PurePortal does not acquire a separate legal basis merely by providing the software.
          </p>
          <p>
            HTTP response bodies are inspected transiently for configured assertions but are not
            stored as check results. Direct HTTP, TCP, and DNS checks disclose the server&apos;s IP
            address and a Mimorii user agent to the target selected by the team.
          </p>
          <p>
            Desktop collectors report their name, hostname, operating system and version, collector
            version, capabilities, last-seen time, CPU and load, memory and swap use, process count,
            network byte totals, mounted-volume names and capacity, uptime, and recognized
            technology names. Android collectors report the device manufacturer and model, Android
            version and security patch, client version, uptime, battery state and temperature,
            memory, private storage, connectivity, power restrictions, and thermal state. Neither
            sends a complete process list or executes remote shell commands.
          </p>
          <p>
            Email notifications disclose the recipient address and notification content to the SMTP
            service configured by the operator. Webhooks disclose incident, resource, or delivery
            data to the endpoint selected by the team. The codebase does not prescribe an SMTP
            provider; the deployment operator must name its provider and any international transfer.
          </p>
          <p>
            Users can register browser or Android push endpoints. Mimorii stores hashed device and
            endpoint references, encrypted browser subscription details or an encrypted Firebase
            installation ID, platform, state, timestamps, and delivery errors. A push message sends
            its title, body, severity, and application path through the service associated with the
            endpoint. Web Push services receive the subscription endpoint, delivery metadata, and an
            end-to-end encrypted payload. Firebase receives the installation ID and Android message
            content. Web Push and Firebase are optional deployment features; the operator must
            identify the services actually configured, their locations, and any international
            transfers.
          </p>
          <p>
            Public status pages and public or access-key-protected dashboards expose the monitoring
            names, states, measurements, incidents, maintenance, and uptime selected by a team.
            Private dashboards require team membership. Dashboard access keys are stored only as
            hashes and are placed in the shared link fragment before the browser sends them in a
            request header. A status subscriber provides an email address to receive updates.
            Mimorii confirms the subscription through a link valid for 24 hours and includes an
            unsubscribe link in each message. Unsubscribing deletes the subscriber record. The
            organization remains responsible for publication, sharing, and the subscription&apos;s
            legal basis.
          </p>
        </ProcessingEntry>

        <ProcessingEntry title="Sponsorship applications" legalBasis="Article 6(1)(b) GDPR">
          <p>
            The application stores organization, contact name, email, requested tier, and, if
            provided, website and message so PurePortal can review and respond to the request. It
            also stores the review status, review time, and reviewing administrator reference.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Support communication"
          legalBasis="Articles 6(1)(b) and 6(1)(f) GDPR"
        >
          <p>
            When a person contacts PurePortal, contact details, message content, and related account
            information are used to answer and document the request. The legitimate interest is
            efficient support and the establishment, exercise, or defence of legal claims.
          </p>
        </ProcessingEntry>

        <ProcessingEntry title="Illegal-content notices" legalBasis="Article 6(1)(c) GDPR">
          <p>
            A notice under Article 16 of Regulation (EU) 2022/2065 contains the reporting
            person&apos;s contact details where required, the identified public page URL, the
            explanation and supporting information, and the required good-faith statement.
            PurePortal uses it to assess the notice, communicate the result, and meet Digital
            Services Act obligations.
          </p>
        </ProcessingEntry>

        <ProcessingEntry title="Audit and abuse prevention" legalBasis="Article 6(1)(f) GDPR">
          <p>
            Security-relevant actions are recorded with team, account, action, subject, limited
            metadata, and time. Rate limits and credential checks are used to protect accounts,
            systems, and other users. These are PurePortal&apos;s legitimate interests.
          </p>
        </ProcessingEntry>
      </LegalSection>

      <LegalSection title="4. Optional analytics">
        {analyticsConfigured ? (
          <>
            <p>
              With consent under Article 6(1)(a) GDPR and Section 25(1) TDDDG, Mimorii uses Swetrix
              to measure page views, locale and time zone, browser and device characteristics,
              performance, activity heartbeats, errors, selected product actions, and, after
              sign-in, an internal account identifier with team role. The SDK does not set cookies
              or use local or session storage. It does read information from the browser and device
              through browser APIs; this optional access is why analytics remains consent-based
              despite self-hosting.
            </p>
            <p>
              Page-view paths are mapped to fixed routes, and query strings, referral URLs, and
              campaign parameters are removed before transmission. Product-action events contain a
              fixed route and limited operational metadata. Errors are not collected on
              authentication or dynamic routes, and recognizable secrets in error text are redacted.
              The analytics endpoint necessarily receives the IP address and browser request headers
              when a request is delivered. The repository does not establish whether the deployed
              backend stores raw IP addresses or exactly how it creates analytics identifiers; the
              production operator must confirm both points.
            </p>
            {purePortalSwetrix ? (
              <>
                <p>
                  Analytics is sent to PurePortal&apos;s self-hosted Swetrix instance at{" "}
                  <a href="https://swetrix.pureportal.io/">swetrix.pureportal.io</a>. PurePortal
                  remains the controller for this processing. The current integration does not send
                  analytics to Swetrix Ltd.; the analytics code is delivered with the application.
                  Events remain until the instance&apos;s configured retention period expires. That
                  period is managed outside this codebase and must be confirmed before production.
                </p>
                <p>
                  <a
                    href="https://www.cloudflare.com/privacypolicy/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cloudflare, Inc.
                  </a>
                  , 101 Townsend Street, San Francisco, CA 94107, USA provides reverse-proxy,
                  transport-security, routing, and network-security services for this endpoint and
                  processes connection data and the transmitted analytics request. Cloudflare states
                  that it may process data outside the EEA. Its{" "}
                  <a
                    href="https://www.cloudflare.com/cloudflare-customer-dpa/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Data Processing Addendum
                  </a>{" "}
                  provides for the EU-U.S. Data Privacy Framework for covered U.S. transfers and
                  Standard Contractual Clauses for restricted transfers. PurePortal must ensure that
                  the addendum applies to the production account.
                </p>
              </>
            ) : (
              <p>
                This build sends analytics to a self-hosted Swetrix endpoint configured by the
                deployment operator. That operator must identify the endpoint operator, location,
                recipients, and retention period in its deployment-specific notice.
              </p>
            )}
            {sessionReplayConfigured ? (
              <p>
                Session replay is a separate optional setting and is included only when you select
                Accept all or enable it in Privacy settings. When enabled, Swetrix receives sampled
                interaction recordings. The recorder is delivered with the application; all text and
                inputs are masked, images and other visual media are blocked, and iframe recording
                is disabled. Replay is limited to fixed routes and is disabled on login,
                registration, invitation, public status, and dynamic routes. These controls reduce,
                but cannot eliminate, the possibility that personal data is captured.
              </p>
            ) : null}
            <p>
              Analytics and session replay do not start before the relevant choice. Consent can be
              changed at any time through Privacy settings. Withdrawal stops future collection and
              does not affect processing already carried out lawfully. Browser Do Not Track is also
              respected.
            </p>
          </>
        ) : (
          <p>This build does not have optional analytics or session replay configured.</p>
        )}
      </LegalSection>

      <LegalSection title="5. Browser storage">
        <p>
          Mimorii does not set application cookies. It uses browser local storage for the access
          token, session expiry, account and team summaries, active team, selected server URL, a
          chosen landing-page theme, the analytics choice and decision time, and, if push is
          enabled, a random device reference and server-specific endpoint reference. The browser
          also stores the service worker and push subscription requested for Web Push. Swetrix
          itself does not use browser storage in this integration. This storage provides functions
          or choices requested by the user and is used under Section 25(2) No. 2 TDDDG. The session
          and team selection are removed on sign-out and an expired session is removed when the app
          is next opened. Push subscriptions and endpoint references are removed when push is
          disabled; server URL, theme, privacy choice, device reference, and service-worker
          registration remain until changed or browser site data is cleared.
        </p>
      </LegalSection>

      <LegalSection title="6. Recipients and international transfers">
        <ul>
          <li>
            The hosting and database operator chosen for the deployment can process service data.
          </li>
          <li>A configured SMTP provider receives email addresses and message content.</li>
          <li>
            Configured browser push services receive subscription and delivery data with an
            encrypted payload; Firebase receives an Android installation ID and message content when
            a user enables the respective push notifications.
          </li>
          <li>
            User-selected monitoring targets and webhook endpoints receive the data described above.
          </li>
          <li>
            Authorized team members receive data according to their role; authorized global
            administrators receive the platform account and sponsorship data needed for their
            duties.
          </li>
          {analyticsConfigured ? (
            <li>
              {purePortalSwetrix
                ? "PurePortal's analytics instance and Cloudflare receive analytics only after consent. Swetrix Ltd. is not a recipient in this configuration."
                : "The configured analytics endpoint and its network providers receive analytics only after consent."}
            </li>
          ) : null}
          <li>
            Visitors to public status pages and dashboards receive content deliberately published or
            shared by a team.
          </li>
        </ul>
        <p>
          Data is otherwise disclosed where required by law or necessary for legal claims. A user
          can select targets, SMTP services, webhooks, and push services outside the European
          Economic Area. The team is responsible for lawful instructions and transfer safeguards for
          user-selected recipients. PurePortal uses transfers outside the EEA only where an adequacy
          decision or another safeguard under Chapter V GDPR applies. Information about applicable
          safeguards can be requested at{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="7. Retention">
        <ul>
          <li>
            Account, team, configuration, incident, status-page, and dashboard data remain until
            deletion or contract termination.
          </li>
          <li>
            Invitation links expire after 7 days; records are deleted when accepted or by the next
            six-hour cleanup after expiry.
          </li>
          <li>
            Status-subscription links expire after 24 hours; pending records are removed by the next
            six-hour cleanup, and verified records remain until unsubscribe.
          </li>
          <li>Check results and heartbeat events are kept for 365 days by default.</li>
          <li>Host snapshots and Android device status are kept for 90 days by default.</li>
          <li>
            Notification, push-endpoint delivery, and subscriber-delivery records are kept for 180
            days by default. Invalid push endpoints are removed after 180 days, and endpoints not
            refreshed for 270 days are removed.
          </li>
          <li>Audit events are kept for 730 days by default.</li>
          <li>Completed or expired agent tasks are kept for 7 days by default.</li>
          <li>
            Sponsorship applications are kept for 180 days by default; a global administrator can
            set the period between 1 and 3,650 days.
          </li>
          {analyticsConfigured ? (
            <li>
              Analytics remains until the configured Swetrix retention period expires; that period
              is not set in this repository.
            </li>
          ) : null}
          <li>
            API-token hashes are deleted on revocation or by the next six-hour cleanup after their
            selected expiry; tokens without an expiry remain until revocation or account deletion.
          </li>
        </ul>
        <p>
          A deployment operator can shorten or extend the configurable default periods or disable
          scheduled cleanup and must reflect its production settings in its notice. Support
          correspondence, illegal-content notices, and infrastructure logs are deleted when no
          longer needed for the request, security, statutory follow-up, or legal claims, subject to
          mandatory retention duties. Backups are overwritten according to the deployment&apos;s
          backup cycle, which must also be disclosed by its operator.
        </p>
      </LegalSection>

      <LegalSection title="8. Sources and required information">
        <p>
          Most data comes from the person using Mimorii. Team invitation details come from the team
          member who sends the invitation. Agent and monitoring measurements come from the selected
          device or target. Public status and dashboard content comes from the publishing team. Push
          endpoint details come from the browser push service or Android installation registered by
          the user.
        </p>
        <p>
          Registration name, email, password, and Terms acceptance are required to create an
          account. Required sponsorship fields are needed to review the application. A status email
          is required only if a person chooses to subscribe. Without required information, the
          respective function cannot be provided.
        </p>
        <p>
          Mimorii does not make decisions producing legal or similarly significant effects solely by
          automated means.
        </p>
      </LegalSection>

      <LegalSection title="9. Rights">
        <p>
          Subject to the statutory conditions, data subjects may request access, rectification,
          erasure, restriction, and portability of their data. They may object to processing based
          on Article 6(1)(f) GDPR for reasons arising from their situation and may withdraw consent
          at any time for future processing. Requests can be sent to{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. Identity may need to
          be verified before a request is fulfilled.
        </p>
        <p>
          For personal data controlled by a team using Mimorii, requests should be directed to that
          organization. PurePortal assists the organization where required as its processor.
        </p>
        <p>
          A complaint may be submitted to any competent data protection authority. The authority
          responsible for PurePortal is the State Commissioner for Data Protection and Freedom of
          Information Baden-Württemberg, Heilbronner Straße 35, 70191 Stuttgart, Germany,{" "}
          <a href="mailto:poststelle@lfdi.bwl.de">poststelle@lfdi.bwl.de</a>,{" "}
          <a href="https://www.baden-wuerttemberg.datenschutz.de/">
            baden-wuerttemberg.datenschutz.de
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="10. Security and changes">
        <p>
          Mimorii hashes passwords and access secrets, signs sessions and unsubscribe references,
          encrypts notification-channel and push-endpoint configuration at rest, validates
          permissions, and limits requests. Deployment operators remain responsible for HTTPS,
          secure secret management, database and backup protection, and timely updates.
        </p>
        <p>
          This policy will be updated when processing or legal requirements materially change. The
          current version is published on this page.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

function ProcessingEntry({
  title,
  legalBasis,
  children,
}: {
  title: string;
  legalBasis: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line p-5">
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      <p className="text-xs font-semibold text-violet-strong">{legalBasis}</p>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function swetrixHostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
