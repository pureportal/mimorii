import { LegalAddress, LegalPage, LegalSection } from "../../components/legal-layout";
import { legalProvider } from "../../lib/legal";
import { analyticsConfigured } from "../../lib/analytics";
import { ProcessingEntry } from "./privacy-processing";

export function GermanPrivacyPolicy() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <LegalSection title="1. Geltungsbereich und Verantwortlichkeit">
        <p>
          Diese Erklärung beschreibt die Verarbeitung personenbezogener Daten im Dienst Mimorii, den
          Andreas Ehrhardt, handelnd unter PurePortal, betreibt. Für diese Website, die
          Kontoverwaltung, den Support, Sponsoring-Bewerbungen, die Sicherheit des Dienstes und die
          optionale Analyse ist PurePortal Verantwortlicher im Sinne der Datenschutz-Grundverordnung
          (DSGVO).
        </p>
        <p>
          Organisationen, die Mimorii nutzen, entscheiden, welche Systeme, Teammitglieder,
          Benachrichtigungsempfänger und Statusinhalte sie eingeben. Für personenbezogene Daten, die
          PurePortal ausschließlich nach ihren Weisungen verarbeitet, ist die Organisation
          Verantwortlicher und PurePortal Auftragsverarbeiter. Vor Beginn einer solchen Verarbeitung
          ist ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO erforderlich.
        </p>
        <p>
          Mimorii kann auch selbst gehostet und mit einem vom Nutzer gewählten Server verbunden
          werden. Für eine solche Installation ist ein unabhängiger Serverbetreiber verantwortlich,
          der eigene Datenschutzhinweise bereitstellen muss. PurePortal erhält aus einer unabhängig
          gehosteten Installation keine Daten allein deshalb, weil die Mimorii-Software verwendet
          wird.
        </p>
      </LegalSection>

      <LegalSection title="2. Verantwortlicher">
        <LegalAddress />
        <p>
          E-Mail: <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>
          <br />
          Telefon:{" "}
          <a href={`tel:${legalProvider.phone.replaceAll(" ", "")}`}>{legalProvider.phone}</a>
        </p>
      </LegalSection>

      <LegalSection title="3. Verarbeitung in Mimorii">
        <ProcessingEntry
          title="Bereitstellung und Sicherheit des Dienstes"
          legalBasis="Art. 6 Abs. 1 lit. f DSGVO"
        >
          <p>
            Ein Server und seine Netzwerkinfrastruktur erhalten zwangsläufig Verbindungsdaten wie
            IP-Adresse, Zeitpunkt der Anfrage, angeforderten Pfad sowie Browser- oder
            Client-Informationen. Mimorii erstellt keine Zugriffsprotokolle auf Anwendungsebene.
            Protokollierung durch die Infrastruktur, Hosting-Empfänger und deren Speicherdauer
            hängen von der jeweiligen Installation ab und müssen von deren Betreiber angegeben
            werden. Die berechtigten Interessen liegen in einer sicheren, zuverlässigen
            Bereitstellung und der Missbrauchsabwehr.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Konten und Teams"
          legalBasis="Art. 6 Abs. 1 lit. b und lit. f DSGVO"
        >
          <p>
            Bei der Registrierung werden Name, E-Mail-Adresse, ein Passwort-Hash, Kontozeitstempel,
            die akzeptierte Version der Nutzungsbedingungen und der Zeitpunkt der Annahme,
            Teammitgliedschaft und Rollen, Administratorstatus, der Zeitpunkt einer
            Kontodeaktivierung und der Zeitpunkt der letzten Anmeldung gespeichert. Für die
            Zwei-Faktor-Authentifizierung werden ein verschlüsseltes Authenticator-Geheimnis,
            gehashte Einmal-Wiederherstellungscodes und Zähler für Fehlversuche gespeichert. Nach
            Bestätigung des zweiten Faktors erstellt die Anmeldung eine erneuerbare Sitzung. Der
            Server speichert das zugehörige Erneuerungsgeheimnis nur als Hash und verlängert aktive
            Sitzungen um bis zu 30 Tage ab ihrer letzten Erneuerung. Teameinladungen speichern die
            eingeladene E-Mail-Adresse, die Rolle, die einladende Person und ein gehashtes Token.
            Berechtigte globale Administratoren können Kontonamen und E-Mail-Adressen durchsuchen
            und Metadaten zu Konto, Anmeldung, Zwei-Faktor-Authentifizierung, Anzahl der Teams und
            Anzahl der API-Tokens einsehen, um Zugriff und Sicherheit zu verwalten. Die vertragliche
            Rechtsgrundlage umfasst die Konto- und Teamfunktionen; das berechtigte Interesse umfasst
            den Nachweis der Annahme, die Kontosicherheit und die Plattformverwaltung.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Vom Kunden kontrollierte Dienstdaten"
          legalBasis="Organisation als Verantwortlicher; PurePortal als Auftragsverarbeiter nach Art. 28 DSGVO"
        >
          <p>
            Teams entscheiden, welche Ressourcennamen, Prüfziele, Prüfeinstellungen, Tags,
            Ergebnisse, Fehler, Störungen, Wartungen, Zielvorgaben, Benachrichtigungsempfänger,
            Webhooks sowie öffentlichen Status- und Dashboard-Inhalte Mimorii verarbeitet. Die
            Organisation muss ihre Rechtsgrundlage bestimmen, die erforderlichen
            Datenschutzinformationen bereitstellen und rechtmäßige Weisungen erteilen. PurePortal
            erlangt nicht allein durch die Bereitstellung der Software eine eigene Rechtsgrundlage.
          </p>
          <p>
            HTTP-Antwortinhalte werden für konfigurierte Prüfbedingungen nur vorübergehend
            ausgewertet und nicht als Prüfergebnisse gespeichert. Direkte HTTP-, TCP- und
            DNS-Prüfungen übermitteln die IP-Adresse des Servers und einen Mimorii-User-Agent an das
            vom Team gewählte Ziel.
          </p>
          <p>
            Native Desktop-Agenten übermitteln ihren Namen, Hostnamen, Betriebssystem und dessen
            Version, Agentenversion, Fähigkeiten, Zeitpunkt der letzten Aktivität, CPU und Last,
            Arbeitsspeicher- und Swap-Nutzung, Prozessanzahl, Netzwerk-Byte-Summen, Namen und
            Kapazität eingebundener Datenträger, Betriebszeit sowie erkannte Technologienamen.
            Docker-Check-Runner übermitteln ihre Agentenversion, Fähigkeiten, den Zeitpunkt der
            letzten Aktivität und Prüfergebnisse ohne Host-Snapshots. Android-Agenten übermitteln
            Hersteller und Modell des Geräts, Android-Version und Sicherheitspatch-Stand,
            Client-Version, Betriebszeit, Akkustatus und -temperatur, Arbeitsspeicher, privaten
            Speicher, Konnektivität, Energiesparbeschränkungen und thermischen Zustand. Keiner von
            ihnen sendet eine vollständige Prozessliste oder führt entfernte Shell-Befehle aus.
          </p>
          <p>
            Logs sind nur für Teams verfügbar, für die ein globaler Administrator sie aktiviert hat.
            Vom Team gewählte Absender übermitteln Logzeilen, Zeitstempel, Stufen, Labels und
            Attribute mit einem Quell-Token; der Zeileninhalt wird so gespeichert, wie er gesendet
            wurde. Logs werden für die vom Team gewählte Aufbewahrungsdauer von 1 bis 90 Tagen
            gespeichert. Werden Logs für ein Team deaktiviert, werden dessen gespeicherte Logs 14
            Tage später gelöscht, sofern Logs nicht vorher wieder aktiviert werden. Log-Alarmregeln
            können eine passende Zeile in die daraus entstehende Störung und deren
            Benachrichtigungen übernehmen.
          </p>
          <p>
            E-Mail-Benachrichtigungen übermitteln die Empfängeradresse und den Inhalt der
            Benachrichtigung an den vom Betreiber konfigurierten SMTP-Dienst. Webhooks übermitteln
            Störungs-, Ressourcen- oder Zustellungsdaten an den vom Team gewählten Endpunkt. Die
            Codebasis schreibt keinen SMTP-Anbieter vor; der Betreiber der Installation muss seinen
            Anbieter und jede Drittlandübermittlung benennen.
          </p>
          <p>
            Nutzer können Browser- oder Android-Push-Endpunkte registrieren. Mimorii speichert
            gehashte Geräte- und Endpunktreferenzen, verschlüsselte Details zum Browser-Abonnement
            oder eine verschlüsselte Firebase-Installations-ID, Plattform, Status, Zeitstempel und
            Zustellfehler. Eine Push-Nachricht sendet Titel, Text, Schweregrad und Anwendungspfad
            über den mit dem Endpunkt verbundenen Dienst. Web-Push-Dienste erhalten den
            Abonnement-Endpunkt, Zustellungsmetadaten und einen Ende-zu-Ende-verschlüsselten Inhalt.
            Firebase erhält die Installations-ID und den Inhalt der Android-Nachricht. Web Push und
            Firebase sind optionale Funktionen der Installation; der Betreiber muss die tatsächlich
            konfigurierten Dienste, ihre Standorte und etwaige Drittlandübermittlungen angeben.
          </p>
          <p>
            Öffentliche Statusseiten und öffentliche oder durch Zugriffsschlüssel geschützte
            Dashboards zeigen die von einem Team ausgewählten Monitoring-Namen, Zustände, Messwerte,
            Störungen, Wartungen und Verfügbarkeiten. Private Dashboards erfordern eine
            Teammitgliedschaft. Dashboard-Zugriffsschlüssel werden nur als Hash gespeichert und im
            Fragment des geteilten Links abgelegt, bevor der Browser sie in einem Anfrage-Header
            sendet. Wer Statusmeldungen abonniert, gibt eine E-Mail-Adresse an, um Aktualisierungen
            zu erhalten. Mimorii bestätigt das Abonnement über einen 24 Stunden gültigen Link und
            fügt jeder Nachricht einen Abmeldelink bei. Bei der Abmeldung wird der Abonnenteneintrag
            gelöscht. Die Organisation bleibt für die Veröffentlichung, das Teilen und die
            Rechtsgrundlage des Abonnements verantwortlich.
          </p>
        </ProcessingEntry>

        <ProcessingEntry title="Sponsoring-Bewerbungen" legalBasis="Art. 6 Abs. 1 lit. b DSGVO">
          <p>
            Die Bewerbung speichert Organisation, Name der Kontaktperson, E-Mail-Adresse, gewünschte
            Stufe sowie, falls angegeben, Website und Nachricht, damit PurePortal die Anfrage prüfen
            und beantworten kann. Außerdem werden der Prüfstatus, der Zeitpunkt der Prüfung und eine
            Referenz auf den prüfenden Administrator gespeichert.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Support-Kommunikation"
          legalBasis="Art. 6 Abs. 1 lit. b und lit. f DSGVO"
        >
          <p>
            Wenn sich eine Person an PurePortal wendet, werden Kontaktdaten, Nachrichteninhalt und
            zugehörige Kontoinformationen verwendet, um die Anfrage zu beantworten und zu
            dokumentieren. Das berechtigte Interesse liegt in einem effizienten Support sowie in der
            Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Meldungen rechtswidriger Inhalte"
          legalBasis="Art. 6 Abs. 1 lit. c DSGVO"
        >
          <p>
            Eine Meldung nach Artikel 16 der Verordnung (EU) 2022/2065 enthält, soweit erforderlich,
            die Kontaktdaten der meldenden Person, die URL der betroffenen öffentlichen Seite, die
            Begründung und unterstützende Informationen sowie die erforderliche Erklärung, dass die
            Meldung in gutem Glauben erfolgt. PurePortal verwendet sie, um die Meldung zu prüfen,
            das Ergebnis mitzuteilen und die Pflichten aus dem Digital Services Act zu erfüllen.
          </p>
        </ProcessingEntry>

        <ProcessingEntry
          title="Protokollierung und Missbrauchsabwehr"
          legalBasis="Art. 6 Abs. 1 lit. f DSGVO"
        >
          <p>
            Sicherheitsrelevante Aktionen werden mit Team, Konto, Aktion, Gegenstand, begrenzten
            Metadaten und Zeitpunkt protokolliert. Anfragelimits und Prüfungen von Zugangsdaten
            dienen dem Schutz von Konten, Systemen und anderen Nutzern. Darin liegen die
            berechtigten Interessen von PurePortal.
          </p>
        </ProcessingEntry>
      </LegalSection>

      <LegalSection title="4. Optionale Analyse">
        {analyticsConfigured ? (
          <>
            <p>
              Mit Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG misst Mimorii
              seine eigene Nutzung mit der in Mimorii integrierten Website-Analyse. Ein externer
              Analysedienst ist nicht beteiligt. Das Skript läuft erst nach der Einwilligung und
              liest über Browser-Schnittstellen die Seitenadresse, die vorherige Seite, die Breite
              des Browserfensters, die Zeitzone und die Sprache aus. Es erfasst Seitenaufrufe,
              Verweildauer, Scrolltiefe, Core Web Vitals, JavaScript-Fehler, wenige Produktaktionen
              wie Anmeldung und Registrierung, ausgehende Links sowie Klickpositionen auf
              Bedienelementen. Es setzt keine Cookies, nutzt keinen Browserspeicher, erfasst keine
              eingegebenen Texte und verknüpft Messungen nicht mit einem Konto.
            </p>
            <p>
              Der Server erhält bei der Zustellung einer Messung die IP-Adresse und die
              Anfrage-Header des Browsers. Er leitet Browser, Betriebssystem und Gerätetyp aus dem
              User-Agent ab und zählt Besucher mit einem schlüsselbasierten Hash aus IP-Adresse und
              User-Agent unter einem zufälligen Schlüssel, der täglich wechselt und nach Ablauf des
              Tages gelöscht wird. IP-Adresse und User-Agent werden nicht gespeichert, und ein
              Besucher kann nicht tagesübergreifend wiedererkannt werden. Suchparameter außer
              Kampagnenparametern werden entfernt, kennungsartige Teile von Seitenadressen ersetzt
              und E-Mail-Adressen sowie lange Zahlen in Ereignis- und Fehlertexten vor der
              Speicherung unkenntlich gemacht. Das Land wird aus der Zeitzone abgeleitet, nicht aus
              der IP-Adresse.
            </p>
            <p>
              Die Einwilligung kann jederzeit unter „Datenschutzeinstellungen“ geändert werden. Ein
              Widerruf beendet die weitere Erhebung; die Rechtmäßigkeit der bis zum Widerruf
              erfolgten Verarbeitung bleibt unberührt. Browser, die „Do Not Track“ oder „Global
              Privacy Control“ senden, werden nicht gemessen.
            </p>
          </>
        ) : (
          <p>In diesem Build ist keine optionale Analyse konfiguriert.</p>
        )}
      </LegalSection>

      <LegalSection title="5. Speicher im Browser">
        <p>
          Mimorii setzt keine Anwendungs-Cookies. Im lokalen Speicher des Browsers werden die
          Access- und Refresh-Token und ihre Ablaufzeiten, Konto- und Teamübersichten, das aktive
          Team, die gewählte Server-URL, das gewählte Design und die gewählte Sprache der
          Startseite, die Analyseauswahl und der Zeitpunkt dieser Entscheidung sowie bei aktiviertem
          Push eine zufällige Gerätereferenz und eine serverspezifische Endpunktreferenz
          gespeichert. Der Browser speichert außerdem den Service Worker und das für Web Push
          angeforderte Push-Abonnement. Das Analyseskript nutzt keinen Browserspeicher. Dieser
          Speicher stellt vom Nutzer angeforderte Funktionen oder Einstellungen bereit und wird nach
          § 25 Abs. 2 Nr. 2 TDDDG genutzt. Sitzung und Teamauswahl werden bei der Abmeldung
          entfernt; eine abgelaufene Sitzung wird beim nächsten Öffnen der App entfernt.
          Push-Abonnements und Endpunktreferenzen werden entfernt, wenn Push deaktiviert wird;
          Server-URL, Design, Sprache, Datenschutzauswahl, Gerätereferenz und
          Service-Worker-Registrierung bleiben bestehen, bis sie geändert oder die Websitedaten im
          Browser gelöscht werden.
        </p>
      </LegalSection>

      <LegalSection title="6. Empfänger und Drittlandübermittlungen">
        <ul>
          <li>
            Der für die Installation gewählte Hosting- und Datenbankbetreiber kann Dienstdaten
            verarbeiten.
          </li>
          <li>Ein konfigurierter SMTP-Anbieter erhält E-Mail-Adressen und Nachrichteninhalte.</li>
          <li>
            Konfigurierte Browser-Push-Dienste erhalten Abonnement- und Zustellungsdaten mit einem
            verschlüsselten Inhalt; Firebase erhält eine Android-Installations-ID und den
            Nachrichteninhalt, wenn ein Nutzer die jeweiligen Push-Benachrichtigungen aktiviert.
          </li>
          <li>
            Vom Nutzer gewählte Monitoring-Ziele und Webhook-Endpunkte erhalten die oben
            beschriebenen Daten.
          </li>
          <li>
            Berechtigte Teammitglieder erhalten Daten entsprechend ihrer Rolle; berechtigte globale
            Administratoren erhalten die für ihre Aufgaben erforderlichen Plattformkonto- und
            Sponsoringdaten.
          </li>
          <li>
            Besucher öffentlicher Statusseiten und Dashboards erhalten Inhalte, die ein Team bewusst
            veröffentlicht oder geteilt hat.
          </li>
        </ul>
        <p>
          Im Übrigen werden Daten offengelegt, soweit dies gesetzlich vorgeschrieben oder für
          Rechtsansprüche erforderlich ist. Nutzer können Ziele, SMTP-Dienste, Webhooks und
          Push-Dienste außerhalb des Europäischen Wirtschaftsraums wählen. Für rechtmäßige Weisungen
          und Übermittlungsgarantien bei vom Nutzer gewählten Empfängern ist das Team
          verantwortlich. PurePortal nutzt Übermittlungen außerhalb des EWR nur, soweit ein
          Angemessenheitsbeschluss oder eine andere Garantie nach Kapitel V DSGVO besteht.
          Informationen zu den jeweiligen Garantien können unter{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a> angefordert werden.
        </p>
      </LegalSection>

      <LegalSection title="7. Speicherdauer">
        <ul>
          <li>
            Konto-, Team-, Konfigurations-, Störungs-, Statusseiten- und Dashboard-Daten bleiben bis
            zur Löschung oder Vertragsbeendigung gespeichert.
          </li>
          <li>
            Einladungslinks laufen nach 7 Tagen ab; Einträge werden bei Annahme oder beim nächsten
            sechsstündlichen Bereinigungslauf nach Ablauf gelöscht.
          </li>
          <li>
            Links für Statusabonnements laufen nach 24 Stunden ab; ausstehende Einträge werden beim
            nächsten sechsstündlichen Bereinigungslauf entfernt, bestätigte Einträge bleiben bis zur
            Abmeldung bestehen.
          </li>
          <li>
            Prüfergebnisse und Heartbeat-Ereignisse werden standardmäßig 365 Tage gespeichert.
          </li>
          <li>Host-Snapshots und Android-Gerätestatus werden standardmäßig 90 Tage gespeichert.</li>
          <li>
            Einträge zu Benachrichtigungen, Zustellungen an Push-Endpunkte und Zustellungen an
            Abonnenten werden standardmäßig 180 Tage gespeichert. Ungültige Push-Endpunkte werden
            nach 180 Tagen entfernt, und Endpunkte, die 270 Tage lang nicht aktualisiert wurden,
            werden entfernt.
          </li>
          <li>Audit-Ereignisse werden standardmäßig 730 Tage gespeichert.</li>
          <li>
            Abgeschlossene oder abgelaufene Agentenaufgaben werden standardmäßig 7 Tage gespeichert.
          </li>
          <li>
            Sponsoring-Bewerbungen werden standardmäßig 180 Tage gespeichert; ein globaler
            Administrator kann den Zeitraum zwischen 1 und 3.650 Tagen festlegen.
          </li>
          {analyticsConfigured ? (
            <li>
              Analysemessungen werden standardmäßig 395 Tage und Klickpositionen 90 Tage
              gespeichert; der tägliche Besucherschlüssel wird nach Ablauf seines Tages gelöscht.
            </li>
          ) : null}
          <li>
            API-Token-Hashes werden beim Widerruf oder beim nächsten sechsstündlichen
            Bereinigungslauf nach ihrem gewählten Ablaufdatum gelöscht; Tokens ohne Ablaufdatum
            bleiben bis zum Widerruf oder zur Löschung des Kontos bestehen.
          </li>
        </ul>
        <p>
          Ein Betreiber der Installation kann die konfigurierbaren Standardfristen verkürzen oder
          verlängern oder die geplante Bereinigung deaktivieren und muss seine
          Produktiveinstellungen in seinen Hinweisen angeben. Support-Korrespondenz, Meldungen
          rechtswidriger Inhalte und Infrastrukturprotokolle werden gelöscht, sobald sie für die
          Anfrage, die Sicherheit, gesetzlich vorgeschriebene Folgemaßnahmen oder Rechtsansprüche
          nicht mehr benötigt werden, vorbehaltlich gesetzlicher Aufbewahrungspflichten. Backups
          werden entsprechend dem Sicherungszyklus der Installation überschrieben, den deren
          Betreiber ebenfalls offenlegen muss.
        </p>
      </LegalSection>

      <LegalSection title="8. Herkunft der Daten und Pflichtangaben">
        <p>
          Die meisten Daten stammen von der Person, die Mimorii nutzt. Angaben zu Teameinladungen
          stammen von dem Teammitglied, das die Einladung versendet. Agenten- und
          Monitoring-Messwerte stammen vom gewählten Gerät oder Ziel. Öffentliche Status- und
          Dashboard-Inhalte stammen vom veröffentlichenden Team. Angaben zu Push-Endpunkten stammen
          vom Push-Dienst des Browsers oder von der vom Nutzer registrierten Android-Installation.
        </p>
        <p>
          Name, E-Mail-Adresse, Passwort und die Annahme der Nutzungsbedingungen sind für die
          Erstellung eines Kontos erforderlich. Die Pflichtfelder der Sponsoring-Bewerbung werden
          für deren Prüfung benötigt. Eine E-Mail-Adresse für Statusmeldungen ist nur erforderlich,
          wenn sich eine Person für ein Abonnement entscheidet. Ohne die erforderlichen Angaben kann
          die jeweilige Funktion nicht bereitgestellt werden.
        </p>
        <p>
          Mimorii trifft keine ausschließlich auf automatisierter Verarbeitung beruhenden
          Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22
          DSGVO.
        </p>
      </LegalSection>

      <LegalSection title="9. Ihre Rechte">
        <p>
          Unter den gesetzlichen Voraussetzungen haben Sie das Recht auf Auskunft (Art. 15 DSGVO),
          Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und
          Datenübertragbarkeit (Art. 20). Beruht die Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO,
          können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, widersprechen
          (Art. 21). Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen.
          Angemeldet können Sie Ihre Kontodaten unter Account → Your data herunterladen und Ihr
          Konto dort löschen. Weitere Anfragen richten Sie an{" "}
          <a href={`mailto:${legalProvider.email}`}>{legalProvider.email}</a>. Vor der Erfüllung
          einer Anfrage kann eine Überprüfung Ihrer Identität erforderlich sein.
        </p>
        <p>
          Für personenbezogene Daten, für die ein Mimorii nutzendes Team verantwortlich ist, richten
          Sie Anfragen bitte an diese Organisation. PurePortal unterstützt die Organisation dabei,
          soweit erforderlich, als ihr Auftragsverarbeiter.
        </p>
        <p>
          Sie können sich bei jeder nach Art. 77 DSGVO zuständigen Datenschutzaufsichtsbehörde
          beschweren. Für PurePortal zuständig ist der Landesbeauftragte für den Datenschutz und die
          Informationsfreiheit Baden-Württemberg, Heilbronner Straße 35, 70191 Stuttgart,
          Deutschland, <a href="mailto:poststelle@lfdi.bwl.de">poststelle@lfdi.bwl.de</a>,{" "}
          <a href="https://www.baden-wuerttemberg.datenschutz.de/">
            baden-wuerttemberg.datenschutz.de
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="10. Sicherheit und Änderungen">
        <p>
          Mimorii hasht Passwörter und Zugangsgeheimnisse, signiert Sitzungen und Abmeldereferenzen,
          verschlüsselt die Konfiguration von Benachrichtigungskanälen und Push-Endpunkten im
          gespeicherten Zustand, prüft Berechtigungen und begrenzt Anfragen. Betreiber von
          Installationen bleiben für HTTPS, eine sichere Verwaltung von Geheimnissen, den Schutz von
          Datenbank und Backups sowie zeitnahe Updates verantwortlich.
        </p>
        <p>
          Diese Erklärung wird aktualisiert, wenn sich die Verarbeitung oder die rechtlichen
          Anforderungen wesentlich ändern. Die aktuelle Fassung ist auf dieser Seite veröffentlicht.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
