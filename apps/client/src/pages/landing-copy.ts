import type { LandingSceneId } from "../components/landing-visuals";
import type { Locale } from "../lib/locale";

export interface LandingCopy {
  meta: { title: string; description: string };
  hero: { title: string; lead: string; primary: string; secondary: string; alt: string };
  scenes: { id: Exclude<LandingSceneId, "overview">; title: string; text: string; alt: string }[];
  benefits: { title: string; text: string }[];
  mcp: { title: string; text: string; link: string };
  download: { title: string; items: { name: string; platform: string }[] };
  sponsors: {
    title: string;
    all: string;
    platinum: string;
    failed: string;
  };
  cta: { title: string; button: string };
}

export const landingCopy: Record<Locale, LandingCopy> = {
  en: {
    meta: {
      title: "Mimorii · Uptime, server health and status pages",
      description:
        "See what's up with your websites, servers and private systems in one calm view, with alerts, status pages and reports.",
    },
    hero: {
      title: "See what's up with your services.",
      lead: "Uptime, server health and logs in one calm view. Know about problems before your customers do.",
      primary: "Create your workspace",
      secondary: "See it in action",
      alt: "Mimorii overview with uptime, average latency, passing monitors, a 24-hour response time chart and the current state of every resource",
    },
    scenes: [
      {
        id: "resource",
        title: "Every server and service at a glance.",
        text: "Websites, ports, DNS, CPU, memory and disks are checked around the clock, with history for each.",
        alt: "Resource details for an application server with a CPU and memory chart and its checks, all healthy",
      },
      {
        id: "logs",
        title: "Find the cause, not just the alarm.",
        text: "Search application logs next to the services they belong to, without switching tools.",
        alt: "Log explorer with log volume by level and a live list of application log lines",
      },
      {
        id: "status-page",
        title: "Keep your customers informed.",
        text: "Publish a status page with live availability, planned maintenance and incident updates.",
        alt: "Public status page in light and dark mode showing all systems operational and 30 days of availability",
      },
      {
        id: "reports",
        title: "Show reliability in numbers.",
        text: "Availability, response times and incidents for any period, ready to export.",
        alt: "Reliability report with 30-day availability, P95 latency, incident count and average recovery time",
      },
    ],
    benefits: [
      {
        title: "Nothing exposed",
        text: "Agents in private networks only connect outward. No inbound ports to open.",
      },
      {
        title: "Alerts where you are",
        text: "Email, webhooks and push notifications as soon as something changes.",
      },
      {
        title: "Your infrastructure",
        text: "Run Mimorii on your own servers, or start right here.",
      },
    ],
    mcp: {
      title: "Ask your AI assistant",
      text: "Connect an MCP-compatible client to check service health and investigate incidents.",
      link: "Learn how MCP works",
    },
    download: {
      title: "Download Mimorii",
      items: [
        { name: "Windows agent", platform: "Windows x64 · MSI" },
        { name: "Ubuntu / Debian agent", platform: "Linux x64 · TAR.GZ" },
        { name: "Android agent", platform: "Android · APK" },
        { name: "Android client", platform: "Android · APK" },
      ],
    },
    sponsors: {
      title: "Sponsors",
      all: "See all sponsors",
      platinum: "Platinum sponsors",
      failed: "Sponsors failed to load. Try again",
    },
    cta: { title: "Keep an eye on your services.", button: "Start monitoring" },
  },
  de: {
    meta: {
      title: "Mimorii · Verfügbarkeit, Serverzustand und Statusseiten",
      description:
        "Websites, Server und private Systeme in einer ruhigen Übersicht – mit Benachrichtigungen, Statusseiten und Berichten.",
    },
    hero: {
      title: "Sehen Sie, wie es Ihren Diensten geht.",
      lead: "Verfügbarkeit, Serverzustand und Logs in einer ruhigen Übersicht. Erfahren Sie von Problemen, bevor Ihre Kunden es tun.",
      primary: "Arbeitsbereich erstellen",
      secondary: "Produkt ansehen",
      alt: "Mimorii-Übersicht mit Verfügbarkeit, durchschnittlicher Latenz, erfolgreichen Prüfungen, einem 24-Stunden-Antwortzeitdiagramm und dem aktuellen Zustand jeder Ressource",
    },
    scenes: [
      {
        id: "resource",
        title: "Jeder Server und Dienst auf einen Blick.",
        text: "Websites, Ports, DNS, CPU, Arbeitsspeicher und Festplatten werden rund um die Uhr geprüft – mit Verlauf für jeden Dienst.",
        alt: "Ressourcendetails eines Anwendungsservers mit CPU- und Speicherdiagramm und seinen Prüfungen, alle in Ordnung",
      },
      {
        id: "logs",
        title: "Die Ursache finden, nicht nur den Alarm.",
        text: "Durchsuchen Sie Anwendungslogs direkt bei den Diensten, zu denen sie gehören – ohne Toolwechsel.",
        alt: "Log-Explorer mit Logvolumen nach Stufe und einer laufenden Liste von Anwendungslogzeilen",
      },
      {
        id: "status-page",
        title: "Halten Sie Ihre Kunden auf dem Laufenden.",
        text: "Veröffentlichen Sie eine Statusseite mit aktueller Verfügbarkeit, geplanten Wartungen und Störungsmeldungen.",
        alt: "Öffentliche Statusseite im hellen und dunklen Design mit allen Systemen in Betrieb und 30 Tagen Verfügbarkeit",
      },
      {
        id: "reports",
        title: "Zuverlässigkeit in Zahlen.",
        text: "Verfügbarkeit, Antwortzeiten und Störungen für jeden Zeitraum – bereit zum Export.",
        alt: "Zuverlässigkeitsbericht mit 30-Tage-Verfügbarkeit, P95-Latenz, Anzahl der Störungen und durchschnittlicher Wiederherstellungszeit",
      },
    ],
    benefits: [
      {
        title: "Nichts wird geöffnet",
        text: "Agenten in privaten Netzwerken verbinden sich nur nach außen. Keine eingehenden Ports nötig.",
      },
      {
        title: "Benachrichtigt, wo Sie sind",
        text: "E-Mail, Webhooks und Push-Nachrichten, sobald sich etwas ändert.",
      },
      {
        title: "Ihre Infrastruktur",
        text: "Betreiben Sie Mimorii auf Ihren eigenen Servern oder starten Sie direkt hier.",
      },
    ],
    mcp: {
      title: "Fragen Sie Ihren KI-Assistenten",
      text: "Verbinden Sie einen MCP-fähigen Client, um den Zustand Ihrer Dienste zu prüfen und Störungen zu untersuchen.",
      link: "So funktioniert MCP",
    },
    download: {
      title: "Mimorii herunterladen",
      items: [
        { name: "Windows-Agent", platform: "Windows x64 · MSI" },
        { name: "Ubuntu-/Debian-Agent", platform: "Linux x64 · TAR.GZ" },
        { name: "Android-Agent", platform: "Android · APK" },
        { name: "Android-Client", platform: "Android · APK" },
      ],
    },
    sponsors: {
      title: "Sponsoren",
      all: "Alle Sponsoren ansehen",
      platinum: "Platin-Sponsoren",
      failed: "Sponsoren konnten nicht geladen werden. Erneut versuchen",
    },
    cta: { title: "Behalten Sie Ihre Dienste im Blick.", button: "Jetzt starten" },
  },
};
