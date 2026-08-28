import {
  ArrowRight,
  BarChart3,
  Bot,
  Database,
  Download,
  Gauge,
  HeartPulse,
  LockKeyhole,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { AgentTopology, HeroVisual, MonitoringDashboard } from "../components/landing-visuals";
import { Reveal } from "../components/landing-motion";
import { SponsorCarousel } from "../components/sponsor-carousel";
import { TierArtwork } from "../components/tier-artwork";
import { Button } from "../components/ui/button";
import { useSponsors } from "../lib/sponsors";
import { getSponsorshipTierDetails } from "../lib/sponsorship";

const capabilities = [
  { icon: Wifi, label: "Uptime and port checks", tone: "bg-mint/18 text-success-strong" },
  { icon: Gauge, label: "CPU and memory", tone: "bg-lavender-soft text-violet-strong" },
  { icon: Database, label: "Disk use and limits", tone: "bg-coral/12 text-danger" },
  { icon: BarChart3, label: "History and incidents", tone: "bg-warning/16 text-warning-strong" },
];

const monitoringDetails = [
  {
    icon: HeartPulse,
    title: "Websites, ports, and DNS",
    description: "Check HTTP responses, TCP ports, and DNS records.",
  },
  {
    icon: Server,
    title: "Server health",
    description: "Track CPU, memory, load, and disk use against your limits.",
  },
  {
    icon: BarChart3,
    title: "History",
    description: "See uptime, response times, and incident duration together.",
  },
];

const mcpHighlights = [
  {
    icon: Bot,
    title: "Monitoring context",
    description: "Teams, resources, checks, heartbeats, incidents, and maintenance.",
  },
  {
    icon: BarChart3,
    title: "Reliability reports",
    description: "Availability, response times, and service objectives.",
  },
  {
    icon: ShieldCheck,
    title: "Permission-aware actions",
    description: "Mimorii applies your approved access and current team role.",
  },
];

const downloads = [
  {
    name: "Windows agent",
    platform: "Windows x64 · MSI",
    href: "https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-windows-x64.msi",
  },
  {
    name: "Ubuntu / Debian agent",
    platform: "Linux x64 · TAR.GZ",
    href: "https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-ubuntu-debian-x64.tar.gz",
  },
  {
    name: "Android agent",
    platform: "Android · APK",
    href: "https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-android.apk",
  },
  {
    name: "Android client",
    platform: "Android · APK",
    href: "https://github.com/pureportal/mimorii/releases/latest/download/mimorii-client-android.apk",
  },
];

export function LandingPage() {
  const sponsors = useSponsors();
  const platinum = getSponsorshipTierDetails("platinum");
  const platinumSponsors =
    sponsors.data?.find((collection) => collection.tier === "platinum")?.sponsors ?? [];

  return (
    <main>
      <section className="landing-hero relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16 lg:px-8 lg:pb-32 lg:pt-16">
        <motion.div
          className="relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="max-w-xl font-display text-5xl font-black leading-[1.02] tracking-[-0.045em] text-ink sm:text-6xl lg:text-7xl">
            See what&apos;s up with your <span className="text-danger">services.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
            Monitor uptime, server health, private services, and history in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Button asChild size="lg" variant="coral">
              <Link to="/register">
                Create your workspace <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#monitoring">Explore monitoring</a>
            </Button>
          </div>
        </motion.div>

        <HeroVisual />
      </section>

      <section id="monitoring" className="scroll-mt-20 border-y border-line bg-surface/72">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-28">
          <Reveal className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[.18em] text-coral-strong">
                Monitoring
              </p>
              <h2 className="mt-3 max-w-lg font-display text-4xl font-black tracking-tight sm:text-5xl">
                One view for every signal.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {capabilities.map(({ icon: Icon, label, tone }, index) => (
                <motion.div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-canvas/72 p-3.5"
                  initial={{ y: 12 }}
                  whileInView={{ y: 0 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.32, delay: index * 0.05 }}
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </motion.div>
              ))}
            </div>
          </Reveal>

          <div className="mt-14 grid gap-10 lg:grid-cols-[1.35fr_.65fr] lg:items-center lg:gap-14">
            <Reveal>
              <MonitoringDashboard />
            </Reveal>
            <Reveal className="grid gap-0" delay={0.08}>
              {monitoringDetails.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="group relative border-l border-line py-6 pl-7 last:pb-2"
                >
                  <span className="absolute -left-4 top-5 grid size-8 place-items-center rounded-full border border-line bg-surface text-coral-strong transition group-hover:border-coral group-hover:bg-coral group-hover:text-night">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="font-display text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-7 text-muted">{description}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      <section
        id="agents"
        className="mx-auto grid max-w-7xl scroll-mt-20 gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28"
      >
        <Reveal className="lg:order-2">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-coral-strong">
            Private network agents
          </p>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
            Monitor private networks in one place.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            Linux and Windows agents report server health and private checks without opening inbound
            ports.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Trust icon={LockKeyhole} text="A separate key for every agent" />
            <Trust icon={ShieldCheck} text="No remote command execution" />
          </div>
        </Reveal>
        <Reveal className="lg:order-1" delay={0.08}>
          <AgentTopology />
        </Reveal>
      </section>

      <section id="mcp" className="scroll-mt-20 bg-night text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-coral">
              MCP integration
            </p>
            <h2 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-5xl">
              Use Mimorii from your AI client.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/68">
              Connect an MCP-compatible client to investigate service health and use approved
              Mimorii actions.
            </p>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="mt-8 border-white/15 bg-white/8 text-white hover:border-white/25 hover:bg-white/12"
            >
              <Link to="/mcp">
                Learn how MCP works <ArrowRight />
              </Link>
            </Button>
          </Reveal>
          <Reveal className="grid gap-3" delay={0.08}>
            {mcpHighlights.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/6 p-5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral/14 text-coral">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">{title}</h3>
                  <p className="mt-1 leading-7 text-white/62">{description}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="download" className="scroll-mt-20 border-y border-line bg-surface/72">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-[.62fr_1.38fr] lg:gap-16 lg:px-8 lg:py-28">
          <Reveal>
            <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
              Download Mimorii
            </h2>
          </Reveal>
          <Reveal className="grid gap-3 sm:grid-cols-2" delay={0.08}>
            {downloads.map((download) => (
              <a
                key={download.name}
                href={download.href}
                className="group flex min-h-28 items-center gap-4 rounded-2xl border border-line bg-canvas/72 p-5 outline-none transition hover:-translate-y-0.5 hover:border-lavender hover:bg-lavender-soft focus-visible:ring-2 focus-visible:ring-coral-strong"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral/14 text-coral-strong transition group-hover:bg-coral group-hover:text-night">
                  <Download className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <strong className="block font-display text-lg">{download.name}</strong>
                  <small className="mt-1 block text-sm font-medium text-muted">
                    {download.platform}
                  </small>
                </span>
                <ArrowRight
                  className="ml-auto size-5 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-ink"
                  aria-hidden="true"
                />
              </a>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="sponsors" className="bg-night text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[.76fr_1.24fr] lg:items-center lg:px-8 lg:py-28">
          <Reveal>
            <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
              Sponsors
            </h2>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="mt-8 border-white/15 bg-white/8 text-white hover:border-white/25 hover:bg-white/12"
            >
              <Link to="/sponsors">
                See all sponsors <ArrowRight />
              </Link>
            </Button>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="sponsor-tier-card sponsor-tier-card--platinum grid gap-5 overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/6 p-5 sm:grid-cols-[.72fr_1fr] sm:p-6">
              <TierArtwork className="mx-auto w-full max-w-80" tier="platinum" />
              <div className="relative z-10 flex min-w-0 flex-col justify-center py-2">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className={`size-3 rounded-full ${platinum.accent}`} />
                  <h3 className="font-display text-2xl font-bold" id="landing-platinum-sponsors">
                    Platinum sponsors
                  </h3>
                </div>
                {platinumSponsors.length ? (
                  <div className="mt-6">
                    <SponsorCarousel
                      labelledBy="landing-platinum-sponsors"
                      maxColumns={2}
                      sponsors={platinumSponsors}
                      theme="dark"
                    />
                  </div>
                ) : sponsors.isError ? (
                  <button
                    type="button"
                    className="mt-6 self-start text-sm font-semibold text-coral hover:underline"
                    onClick={() => void sponsors.refetch()}
                  >
                    Sponsors failed to load. Try again
                  </button>
                ) : null}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="landing-cta relative mx-auto max-w-5xl overflow-hidden px-5 py-24 text-center lg:py-28">
        <Reveal className="relative z-10">
          <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
            Keep an eye on your services.
          </h2>
          <Button asChild size="lg" variant="coral" className="mt-8">
            <Link to="/register">
              Start monitoring <ArrowRight />
            </Link>
          </Button>
        </Reveal>
      </section>
    </main>
  );
}

function Trust({ icon: Icon, text }: { icon: typeof LockKeyhole; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm font-semibold">
      <Icon className="size-4 text-success-strong" />
      {text}
    </div>
  );
}
