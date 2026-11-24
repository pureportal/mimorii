import { ArrowRight, BellRing, Bot, Download, LockKeyhole, Server } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../components/landing-motion";
import { ProductScene } from "../components/landing-visuals";
import { SponsorCarousel } from "../components/sponsor-carousel";
import { TierArtwork } from "../components/tier-artwork";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";
import { useAlternateLanguageLinks, useLocale } from "../lib/locale";
import { useSponsors } from "../lib/sponsors";
import { getSponsorshipTierDetails } from "../lib/sponsorship";
import { landingCopy, type LandingCopy } from "./landing-copy";

const downloadAssets = [
  "mimorii-agent-windows-x64.msi",
  "mimorii-agent-ubuntu-debian-x64.tar.gz",
  "mimorii-agent-android.apk",
  "mimorii-client-android.apk",
];

const benefitIcons = [LockKeyhole, BellRing, Server];
const ease = [0.22, 1, 0.36, 1] as const;

export function LandingPage() {
  const { locale } = useLocale();
  const copy = landingCopy[locale];
  useLandingMeta(copy.meta);

  return (
    <main className="overflow-x-clip">
      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-14 text-center sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <div aria-hidden="true" className="landing-glow" />
        <motion.div
          className="relative mx-auto max-w-3xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <h1 className="font-display text-[2.6rem] font-black leading-[1.04] tracking-[-0.045em] text-ink sm:text-6xl lg:text-7xl">
            {copy.hero.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
            {copy.hero.lead}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 min-[420px]:flex-row">
            <Button asChild size="lg" variant="coral">
              <Link to="/register">
                {copy.hero.primary} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#product">{copy.hero.secondary}</a>
            </Button>
          </div>
        </motion.div>
        <motion.div
          className="relative mx-auto mt-14 max-w-6xl sm:mt-16"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease }}
        >
          <ProductScene
            scene="overview"
            alt={copy.hero.alt}
            priority
            sizes="(min-width: 1216px) 1152px, calc(100vw - 2.5rem)"
          />
        </motion.div>
      </section>

      <section id="product" className="scroll-mt-20">
        <div className="mx-auto grid max-w-7xl gap-24 px-5 py-16 lg:gap-32 lg:px-8 lg:py-24">
          {copy.scenes.map((scene, index) => (
            <Reveal
              key={scene.id}
              className={cn(
                "grid items-center gap-8 lg:gap-14",
                index % 2 === 1
                  ? "lg:grid-cols-[minmax(0,1.28fr)_minmax(0,.72fr)]"
                  : "lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]"
              )}
            >
              <div className={cn("max-w-md", index % 2 === 1 && "lg:order-2")}>
                <h2 className="font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                  {scene.title}
                </h2>
                <p className="mt-4 text-lg leading-8 text-muted">{scene.text}</p>
              </div>
              <ProductScene
                scene={scene.id}
                alt={scene.alt}
                sizes="(min-width: 1280px) 760px, (min-width: 1024px) 60vw, calc(100vw - 2.5rem)"
                className={cn(index % 2 === 1 && "lg:order-1")}
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface/60">
        <Reveal className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8 lg:px-8 lg:py-20">
          {copy.benefits.map((benefit, index) => {
            const Icon = benefitIcons[index] ?? Server;
            return (
              <Benefit key={benefit.title} icon={Icon} title={benefit.title} text={benefit.text} />
            );
          })}
          <Benefit icon={Bot} title={copy.mcp.title} text={copy.mcp.text}>
            <Link
              to="/mcp"
              className="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-coral-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-coral-strong"
            >
              {copy.mcp.link} <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Benefit>
        </Reveal>
      </section>

      <DownloadSection copy={copy.download} />
      <SponsorsSection copy={copy.sponsors} />

      <section className="mx-auto max-w-4xl px-5 py-24 text-center lg:py-32">
        <Reveal>
          <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
            {copy.cta.title}
          </h2>
          <Button asChild size="lg" variant="coral" className="mt-8">
            <Link to="/register">
              {copy.cta.button} <ArrowRight />
            </Link>
          </Button>
        </Reveal>
      </section>
    </main>
  );
}

function useLandingMeta(meta: LandingCopy["meta"]) {
  useAlternateLanguageLinks("/");
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = meta.title;
    if (description) description.content = meta.description;
    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, [meta]);
}

function Benefit({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof Server;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <span className="grid size-10 place-items-center rounded-xl bg-coral/12 text-coral-strong">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 leading-7 text-muted">{text}</p>
      {children}
    </div>
  );
}

function DownloadSection({ copy }: { copy: LandingCopy["download"] }) {
  return (
    <section id="download" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-[.62fr_1.38fr] lg:gap-16 lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
            {copy.title}
          </h2>
        </Reveal>
        <Reveal className="grid gap-3 sm:grid-cols-2" delay={0.08}>
          {copy.items.map((item, index) => (
            <a
              key={item.name}
              href={`https://github.com/pureportal/mimorii/releases/latest/download/${downloadAssets[index]}`}
              className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-surface/70 p-5 outline-none transition hover:-translate-y-0.5 hover:border-lavender focus-visible:ring-2 focus-visible:ring-coral-strong"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral/14 text-coral-strong transition group-hover:bg-coral group-hover:text-night">
                <Download className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <strong className="block font-display text-lg">{item.name}</strong>
                <small className="mt-1 block text-sm font-medium text-muted">{item.platform}</small>
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
  );
}

function SponsorsSection({ copy }: { copy: LandingCopy["sponsors"] }) {
  const sponsors = useSponsors();
  const platinum = getSponsorshipTierDetails("platinum");
  const platinumSponsors =
    sponsors.data?.find((collection) => collection.tier === "platinum")?.sponsors ?? [];

  return (
    <section id="sponsors" className="bg-night text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[.76fr_1.24fr] lg:items-center lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
            {copy.title}
          </h2>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="mt-8 border-white/15 bg-white/8 text-white hover:border-white/25 hover:bg-white/12"
          >
            <Link to="/sponsors">
              {copy.all} <ArrowRight />
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
                  {copy.platinum}
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
                  {copy.failed}
                </button>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
