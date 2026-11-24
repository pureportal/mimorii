import { Link } from "react-router-dom";
import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";

export function GermanTerms() {
  return (
    <LegalPage title="Nutzungsbedingungen">
      <LegalSection title="1. Anbieter und Geltungsbereich">
        <p>
          Diese Nutzungsbedingungen regeln die Nutzung von Mimorii. Anbieter ist Andreas Ehrhardt,
          handelnd unter PurePortal:
        </p>
        <LegalAddress />
        <p>
          Kontakt: <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. Sie gelten
          für den von PurePortal angebotenen gehosteten Dienst. Hostet ein unabhängiger Betreiber
          Mimorii, muss dieser eigene Vertragsbedingungen bereitstellen.
        </p>
      </LegalSection>

      <LegalSection title="2. Vertrag und Konto">
        <p>
          Ein Vertrag kommt zustande, wenn ein Nutzer das Registrierungsformular nach Annahme dieser
          Nutzungsbedingungen absendet und PurePortal das Konto anlegt. Mimorii wird derzeit ohne
          Nutzungsentgelt bereitgestellt. Kostenpflichtige Tarife oder automatische Verlängerungen
          sind nicht Bestandteil dieser Nutzungsbedingungen.
        </p>
        <p>
          Die Registrierung ist auf Englisch verfügbar. Nutzer können ihre Eingaben vor der Auswahl
          von „Create account“ prüfen und korrigieren. Die Kontoerstellung und der sofortige Zugang
          bestätigen den Vertrag. Diese Nutzungsbedingungen können vor der Registrierung aufgerufen,
          gedruckt oder gespeichert werden. PurePortal speichert die akzeptierte Version und den
          Zeitpunkt der Annahme, stellt jedoch kein gesondert gespeichertes Vertragsdokument zum
          späteren Abruf bereit.
        </p>
        <p>
          Nutzer müssen zutreffende Kontoangaben machen, Zugangsdaten und Zugriffstokens vertraulich
          behandeln und PurePortal umgehend über einen Verdacht auf Missbrauch informieren. Konten
          dürfen nicht geteilt werden. Wer ein Team erstellt, handelt als dessen Inhaber und ist für
          die Vergabe angemessener Rollen verantwortlich.
        </p>
      </LegalSection>

      <LegalSection title="3. Leistung">
        <p>
          Mimorii überwacht konfigurierte HTTP-, TCP- und DNS-Ziele, empfängt Messwerte von Agenten
          und Heartbeats, speichert den Monitoring-Verlauf, verwaltet Störungen und Wartungen,
          versendet konfigurierte Benachrichtigungen und kann Statusseiten und Monitoring-Dashboards
          veröffentlichen. Welche Funktionen genau verfügbar sind, hängt von Installation und
          Konfiguration ab.
        </p>
        <p>
          Monitoring-Ergebnisse und Benachrichtigungen können verzögert, unvollständig oder
          fehlerhaft sein. Mimorii ist kein Notfallalarmsystem und darf nicht der einzige Schutz für
          sicherheitskritische oder gesetzlich vorgeschriebene Überwachung sein.
        </p>
      </LegalSection>

      <LegalSection title="4. Zulässiges Monitoring und Agenten">
        <p>
          Nutzer dürfen nur Systeme, Domains, Ports, Netzwerke und Daten überwachen, für die sie
          berechtigt sind. Sie müssen geltendes Recht und die Bedingungen Dritter einhalten. Mimorii
          darf nicht für unbefugtes Scannen, Zugriffsversuche, Ausspähung, Störungen oder zur
          Umgehung technischer Beschränkungen verwendet werden.
        </p>
        <p>
          Nutzer sind dafür verantwortlich, Agenten sicher zu installieren, Registrierungs- und
          Heartbeat-Geheimnisse zu schützen, angemessene Berechtigungen zu wählen und die von einem
          Agenten gesendeten Messwerte vor dem Einsatz zu prüfen.
        </p>
      </LegalSection>

      <LegalSection title="5. Team- und öffentliche Inhalte">
        <p>
          Teaminhaber und Administratoren steuern Mitgliedschaften, konfigurierte Empfänger,
          Webhooks, Ressourcen, Störungen, Statusseiten, Dashboards und deren Zugriffseinstellungen.
          Öffentliche Links sind für jeden zugänglich, der sie erhält, einschließlich durch
          Zugriffsschlüssel geschützter Dashboard-Links. Nutzer bleiben für Rechtmäßigkeit,
          Richtigkeit und Vertraulichkeit der Inhalte, die sie eingeben, veröffentlichen oder
          teilen, sowie für die Rechte daran verantwortlich.
        </p>
        <p>
          Nutzer räumen PurePortal ein nicht ausschließliches Recht ein, ihre Inhalte zu hosten, zu
          vervielfältigen, zu übertragen und anzuzeigen, soweit dies für den Betrieb von Mimorii
          erforderlich ist. Dieses Recht endet mit der Löschung der Inhalte, soweit nicht temporäre
          Backups oder gesetzliche Aufbewahrungspflichten bestehen.
        </p>
      </LegalSection>

      <LegalSection title="6. Zulässige Nutzung">
        <ul>
          <li>
            Nutzen Sie Mimorii nicht für rechtswidrige, betrügerische, missbräuchliche oder
            schädliche Aktivitäten.
          </li>
          <li>
            Beeinträchtigen Sie den Dienst nicht und umgehen Sie keine Zugriffsbeschränkungen oder
            Anfragelimits.
          </li>
          <li>Laden Sie keinen Schadcode und keine Inhalte hoch, die Rechte Dritter verletzen.</li>
          <li>
            Machen Sie über öffentliche Seiten keine personenbezogenen Daten ohne Rechtsgrundlage
            zugänglich.
          </li>
        </ul>
        <p>
          PurePortal darf schädliche Aktivitäten einschränken oder betroffene Zugänge sperren,
          soweit dies zum Schutz von Nutzern, Dritten oder des Dienstes erforderlich ist. Soweit
          möglich, wird der Nutzer informiert und erhält Gelegenheit, Abhilfe zu schaffen.
        </p>
        <p>
          PurePortal überwacht Kundeninhalte nicht proaktiv und trifft keine automatisierten
          Entscheidungen zur Inhaltsmoderation. Bestimmte Inhalte können nach einer Meldung oder,
          soweit für die Sicherheit oder die Einhaltung gesetzlicher Vorgaben erforderlich, manuell
          geprüft werden. Beschränkungen werden sorgfältig, objektiv und verhältnismäßig angewendet.
          Soweit gesetzlich vorgeschrieben, erhält der betroffene Nutzer eine Begründung und
          Informationen zu verfügbaren Rechtsbehelfen und kann den Support um Überprüfung der
          Entscheidung bitten.
        </p>
      </LegalSection>

      <LegalSection title="7. Datenschutz">
        <p>
          Die <Link to="/privacy">Datenschutzerklärung</Link> erläutert die Verarbeitung durch
          PurePortal als Verantwortlicher. Ein Team, das personenbezogene Daten in
          Monitoring-Konfigurationen, Teaminhalte, Benachrichtigungen oder öffentliche Statusseiten
          einträgt, ist für die eigene Rechtsgrundlage und die eigenen Transparenzpflichten
          verantwortlich.
        </p>
        <p>
          Verarbeitet PurePortal solche Daten ausschließlich nach dokumentierten Weisungen eines
          Kunden, müssen die Parteien vor Beginn dieser Verarbeitung den nach Art. 28 DSGVO
          erforderlichen Vertrag zur Auftragsverarbeitung schließen. Wenden Sie sich dazu an{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="8. Verfügbarkeit und Änderungen">
        <p>
          PurePortal darf den Dienst warten, absichern oder weiterentwickeln und Funktionen aus
          berechtigtem Grund ändern oder einstellen. Eine wesentliche Einschränkung wird, soweit
          möglich, mit angemessenem Vorlauf angekündigt. Gesetzliche Gewährleistungsrechte bleiben
          unberührt.
        </p>
      </LegalSection>

      <LegalSection title="9. Beendigung">
        <p>
          Nutzer können die Nutzung von Mimorii jederzeit beenden. Teaminhaber können ein Team in
          den Teameinstellungen löschen; die Löschung eines Kontos kann unter{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a> beantragt werden.
          PurePortal kann ein Konto mit angemessener Frist kündigen und bei einem wesentlichen
          Verstoß oder einem dringenden Sicherheits- oder Rechtsrisiko fristlos kündigen oder
          sperren.
        </p>
        <p>
          Mit der Beendigung endet der Zugang, und Daten werden vorbehaltlich der
          Aufbewahrungsregeln der Datenschutzerklärung und zwingender gesetzlicher Pflichten
          gelöscht. Nutzer sollten benötigte Informationen vor der Löschung sichern.
        </p>
      </LegalSection>

      <LegalSection title="10. Haftung">
        <p>
          PurePortal haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung
          des Lebens, des Körpers oder der Gesundheit, nach dem Produkthaftungsgesetz sowie im
          Umfang einer ausdrücklich übernommenen Garantie. Bei einfacher Fahrlässigkeit haftet
          PurePortal nur für die Verletzung einer wesentlichen Vertragspflicht und nur begrenzt auf
          den vorhersehbaren, vertragstypischen Schaden. Im Übrigen ist die Haftung für einfache
          Fahrlässigkeit ausgeschlossen. Zwingende gesetzliche Haftung und Verbraucherrechte bleiben
          unberührt.
        </p>
      </LegalSection>

      <LegalSection title="11. Änderungen dieser Nutzungsbedingungen">
        <p>
          Änderungen gelten für die Zukunft. PurePortal teilt wesentliche Änderungen vor ihrem
          Inkrafttreten mit und bittet um erneute Zustimmung, soweit dies gesetzlich erforderlich
          ist. Die bloße weitere Nutzung ersetzt keine Einwilligung, wo eine solche gesetzlich
          erforderlich ist.
        </p>
      </LegalSection>

      <LegalSection title="12. Anwendbares Recht">
        <p>
          Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Bei Verbrauchern lässt diese
          Rechtswahl zwingende Schutzvorschriften des Staates, in dem sie ihren gewöhnlichen
          Aufenthalt haben, unberührt. Es gelten die gesetzlichen Gerichtsstandsregeln; gegenüber
          Kaufleuten und juristischen Personen des öffentlichen Rechts sind, soweit zulässig, die
          Gerichte am Geschäftssitz des Anbieters zuständig.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
