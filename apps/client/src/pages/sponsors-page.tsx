import type { SponsorshipApplicationReceipt, SponsorshipTier } from "@mimorii/contracts";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SponsorCarousel } from "../components/sponsor-carousel";
import { TierArtwork } from "../components/tier-artwork";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Input, Select, Textarea } from "../components/ui/input";
import { jsonBody } from "../lib/api";
import { sponsorApi, useSponsors } from "../lib/sponsors";
import { isSponsorshipTier, sponsorshipTierDetails } from "../lib/sponsorship";

export function SponsorsPage() {
  const sponsors = useSponsors();
  const [tier, setTier] = useState<SponsorshipTier>("platinum");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => {
      const entry = form.get(name);
      return typeof entry === "string" ? entry.trim() : "";
    };
    const websiteUrl = value("websiteUrl");
    const message = value("message");
    setError("");
    setSubmitting(true);
    try {
      await sponsorApi<SponsorshipApplicationReceipt>("/sponsors/applications", {
        method: "POST",
        ...jsonBody({
          organizationName: value("organizationName"),
          contactName: value("contactName"),
          email: value("email"),
          ...(websiteUrl ? { websiteUrl } : {}),
          tier,
          ...(message ? { message } : {}),
        }),
      });
      formElement.reset();
      setTier("platinum");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Application could not be sent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="overflow-hidden">
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-10 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:pb-28 lg:pt-16">
        <div>
          <h1 className="font-display text-5xl font-black tracking-[-0.04em] sm:text-6xl">
            Sponsors
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-muted">
            Mimorii stays free to use with support from its sponsors.
          </p>
          <Button asChild size="lg" variant="coral" className="mt-8">
            <a href="#application">
              Apply to sponsor <ArrowRight />
            </a>
          </Button>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-coral/12 via-lavender/12 to-mint/12 blur-3xl" />
          <img
            src="/art/mimorii-sponsors.png"
            alt="Three Mimorii sponsor mascots"
            className="relative aspect-[3/2] w-full rounded-[2.5rem] border border-line object-cover shadow-[0_30px_70px_-38px_rgba(0,0,0,.75)]"
          />
        </div>
      </section>

      <section className="border-y border-line bg-surface/75">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
              Current sponsors
            </h2>
            {sponsors.isError ? (
              <button
                type="button"
                className="text-sm font-semibold text-danger hover:underline"
                onClick={() => void sponsors.refetch()}
              >
                Could not load sponsors. Try again
              </button>
            ) : null}
          </div>
          <div className="mt-10 grid gap-7">
            {sponsorshipTierDetails.map((details) => {
              const tierSponsors =
                sponsors.data?.find((collection) => collection.tier === details.tier)?.sponsors ??
                [];
              const titleId = `${details.tier}-sponsors-title`;
              return (
                <Card
                  key={details.tier}
                  className={`sponsor-tier-card sponsor-tier-card--${details.tier} grid overflow-hidden lg:grid-cols-[minmax(17rem,.62fr)_1.38fr] ${details.surface}`}
                >
                  <div className="grid place-items-center p-6 sm:p-8">
                    <TierArtwork className="w-full max-w-80" tier={details.tier} />
                  </div>
                  <div className="flex min-w-0 flex-col justify-center border-t border-ink/8 p-6 sm:p-8 lg:border-l lg:border-t-0">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`size-3 rounded-full ${details.accent}`}
                      />
                      <h3 className="font-display text-2xl font-bold" id={titleId}>
                        {details.label}
                      </h3>
                    </div>
                    {tierSponsors.length ? (
                      <div className="mt-5 border-t border-ink/8 pt-5">
                        <SponsorCarousel labelledBy={titleId} sponsors={tierSponsors} />
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="application"
        className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[.72fr_1.28fr] lg:px-8 lg:py-24"
      >
        <div>
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
            Apply to sponsor
          </h2>
        </div>
        {submitted ? (
          <Card className="grid min-h-72 place-items-center p-8 text-center" role="status">
            <div>
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h3 className="mt-4 font-display text-2xl font-bold">Application received</h3>
              <Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>
                Send another application
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-5 sm:p-7">
            <form className="grid gap-5" onSubmit={submit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="sponsor-organization">Organization</FieldLabel>
                  <Input
                    id="sponsor-organization"
                    name="organizationName"
                    autoComplete="organization"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sponsor-name">Name</FieldLabel>
                  <Input
                    id="sponsor-name"
                    name="contactName"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="sponsor-email">Email</FieldLabel>
                  <Input
                    id="sponsor-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sponsor-website">Website</FieldLabel>
                  <Input
                    id="sponsor-website"
                    name="websiteUrl"
                    type="url"
                    autoComplete="url"
                    maxLength={2048}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="sponsor-tier">Tier</FieldLabel>
                <Select
                  id="sponsor-tier"
                  name="tier"
                  value={tier}
                  onChange={(event) => {
                    if (isSponsorshipTier(event.target.value)) setTier(event.target.value);
                  }}
                >
                  {sponsorshipTierDetails.map((details) => (
                    <option key={details.tier} value={details.tier}>
                      {details.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="sponsor-message">Message</FieldLabel>
                <Textarea id="sponsor-message" name="message" maxLength={2000} rows={5} />
              </Field>
              <FieldError>
                {error ? (
                  <span id="sponsorship-error" role="alert">
                    {error}
                  </span>
                ) : null}
              </FieldError>
              <Link
                to="/privacy"
                target="_blank"
                rel="noreferrer"
                className="justify-self-start text-xs font-semibold text-violet-strong"
              >
                Privacy policy
              </Link>
              <Button type="submit" variant="coral" size="lg" disabled={submitting}>
                {submitting ? "Sending…" : "Send application"}
              </Button>
            </form>
          </Card>
        )}
      </section>
    </main>
  );
}
