import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";
import { analyticsConfigured } from "../../lib/analytics";
import { ProcessingEntry } from "./privacy-processing";

export function EnglishPrivacyPolicy() {
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
            account-disabled time, and last sign-in time. Two-factor authentication stores an
            encrypted authenticator secret, hashed single-use recovery codes, and failed-attempt
            counters. Login creates a renewable session after the second factor is verified. The
            server stores its refresh credential only as a hash and extends active sessions for up
            to 30 days from their last renewal. Team invitations store the invited email, role,
            inviter, and a hashed token. Authorized global administrators can search account names
            and email addresses and see account, sign-in, two-factor, team-count, and
            API-token-count metadata to administer access and security. The contract basis covers
            account and team functions; the legitimate interest covers proof of acceptance, account
            security, and platform administration.
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
            Native desktop agents report their name, hostname, operating system and version, agent
            version, capabilities, last-seen time, CPU and load, memory and swap use, process count,
            network byte totals, mounted-volume names and capacity, uptime, and recognized
            technology names. Docker check runners report their agent version, capabilities,
            last-seen time, and check results without host snapshots. Android agents report the
            device manufacturer and model, Android version and security patch, client version,
            uptime, battery state and temperature, memory, private storage, connectivity, power
            restrictions, and thermal state. None sends a complete process list or executes remote
            shell commands.
          </p>
          <p>
            Logs are available only for teams where a global administrator enabled them. Senders
            chosen by the team submit log lines, timestamps, levels, labels, and attributes with a
            source token, and the line content is stored as sent. Logs are kept for the retention
            period chosen by the team, from 1 to 90 days. When logs are disabled for a team, its
            stored logs are deleted 14 days later unless logs are enabled again before then. Log
            alert rules can copy a matching line into the resulting incident and its notifications.
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
              With consent under Article 6(1)(a) GDPR and Section 25(1) TDDDG, Mimorii measures its
              own use with the website analytics built into Mimorii. No third-party analytics
              service is involved. The script runs only after consent and reads the page address,
              the previous page, the browser window width, time zone, and language through browser
              APIs. It records page views, time on page, scroll depth, Core Web Vitals, JavaScript
              errors, a few product actions such as sign-in and registration, outbound links, and
              click positions on interface elements. It does not set cookies, use browser storage,
              record typed text, or link measurements to an account.
            </p>
            <p>
              The server receives the IP address and browser request headers when a measurement is
              delivered. It derives browser, operating system, and device type from the user agent
              and counts visitors with a keyed hash of the IP address and user agent under a random
              key that changes every day and is deleted after that day. The IP address and user
              agent are not stored, and a visitor cannot be recognized across days. Query strings
              except campaign parameters are removed, identifier-like parts of page addresses are
              replaced, and email addresses and long numbers in event and error texts are masked
              before storage. The country is derived from the time zone, not from the IP address.
            </p>
            <p>
              Consent can be changed at any time through Privacy settings. Withdrawal stops future
              collection and does not affect processing already carried out lawfully. Browsers that
              send Do Not Track or Global Privacy Control are not measured.
            </p>
          </>
        ) : (
          <p>This build does not have optional analytics configured.</p>
        )}
      </LegalSection>

      <LegalSection title="5. Browser storage">
        <p>
          Mimorii does not set application cookies. It uses browser local storage for the access and
          refresh tokens, their expiry times, account and team summaries, active team, selected
          server URL, a chosen landing-page theme and language, the analytics choice and decision
          time, and, if push is enabled, a random device reference and server-specific endpoint
          reference. The browser also stores the service worker and push subscription requested for
          Web Push. The analytics script does not use browser storage. This storage provides
          functions or choices requested by the user and is used under Section 25(2) No. 2 TDDDG.
          The session and team selection are removed on sign-out and an expired session is removed
          when the app is next opened. Push subscriptions and endpoint references are removed when
          push is disabled; server URL, theme, language, privacy choice, device reference, and
          service-worker registration remain until changed or browser site data is cleared.
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
              Analytics measurements are kept for 395 days and click positions for 90 days by
              default; the daily visitor key is deleted after its day.
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
          at any time for future processing. Signed-in users can download their account data and
          delete their account under Account → Your data. Other requests can be sent to{" "}
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
