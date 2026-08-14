import { Activity, Database, Network, Server } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const responseTime = [
  { time: "00:00", latencyMs: 38 },
  { time: "03:00", latencyMs: 41 },
  { time: "06:00", latencyMs: 37 },
  { time: "09:00", latencyMs: 45 },
  { time: "12:00", latencyMs: 40 },
  { time: "15:00", latencyMs: 52 },
  { time: "18:00", latencyMs: 44 },
  { time: "21:00", latencyMs: 47 },
  { time: "Now", latencyMs: 42 },
];

const uptimeDays = Array.from({ length: 30 }, (_, index) => index + 1);

export function HeroVisual() {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[660px] pb-10 sm:pb-12 lg:pb-8"
      initial={{ opacity: 0, scale: 0.96, x: 24 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <div aria-hidden="true" className="hero-orbit" />
      <div className="hero-frame">
        <img
          src="/art/mimorii-hero.png"
          alt="Illustrated monitoring operator beside service and server charts"
          className="hero-image"
          fetchPriority="high"
        />
        <div aria-hidden="true" className="hero-image-wash" />
      </div>

      <motion.div
        className="absolute -left-1 bottom-1 z-10 w-[min(72%,285px)] rounded-2xl border border-line bg-surface/92 p-3.5 shadow-[0_24px_55px_-28px_rgba(23,21,47,.65)] backdrop-blur-xl sm:-left-5 sm:bottom-2 sm:p-4"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.52, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint/20 text-success-strong">
            <Activity className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold">Everything is up</p>
              <span className="landing-status-dot ml-auto shrink-0" />
            </div>
            <p className="mt-1 text-xs text-muted">Latest check · 42 ms</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -right-1 top-6 z-10 w-[132px] rounded-2xl border border-white/20 bg-night/82 p-3.5 text-white shadow-[0_20px_45px_-24px_rgba(10,9,28,.9)] backdrop-blur-xl sm:-right-4 sm:top-12 sm:w-[168px] sm:p-4"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.64, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/60 sm:text-[11px]">
          30-day uptime
        </p>
        <p className="mt-1 font-display text-lg font-black sm:text-2xl">99.997%</p>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="h-5 flex-1 rounded-full bg-mint/80" />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MonitoringDashboard() {
  const reducedMotion = useReducedMotion();
  const gradientId = `landing-latency-${useId().replaceAll(":", "")}`;

  return (
    <div className="landing-dashboard rounded-[2rem] border border-line bg-surface p-4 shadow-[0_30px_75px_-48px_rgba(23,21,47,.55)] sm:p-6 lg:p-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">Response time</p>
          <p className="mt-1 font-display text-3xl font-black tracking-tight">42 ms</p>
        </div>
        <p className="text-xs font-semibold text-muted">Last 24 hours</p>
      </div>

      <div
        className="mt-5 h-56 min-w-0 sm:h-64"
        role="img"
        aria-label="Response time over the last 24 hours, ending at 42 milliseconds"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={responseTime} margin={{ top: 8, right: 14, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-coral-strong)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-coral-strong)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="time"
              interval={1}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              domain={[0, 60]}
              ticks={[0, 30, 60]}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              tickFormatter={(value: number) => `${value} ms`}
              tickLine={false}
              width={54}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-lavender)", strokeDasharray: "3 4" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-card)",
                color: "var(--color-ink)",
                fontSize: "12px",
              }}
              formatter={(value) => [`${String(value)} ms`, "Response time"]}
              labelStyle={{ color: "var(--color-muted)", marginBottom: "4px" }}
            />
            <Area
              dataKey="latencyMs"
              fill={`url(#${gradientId})`}
              isAnimationActive={!reducedMotion}
              stroke="var(--color-coral-strong)"
              strokeWidth={3}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">30-day uptime</p>
          <p className="font-display text-xl font-black">99.997%</p>
        </div>
        <div
          className="mt-3 grid h-9 grid-cols-[repeat(30,minmax(2px,1fr))] gap-1"
          role="img"
          aria-label="Thirty daily uptime periods, all healthy"
        >
          {uptimeDays.map((day) => (
            <span
              key={day}
              title={`Day ${day}: healthy`}
              className="rounded-sm bg-success-strong"
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-medium text-muted">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

export function AgentTopology() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-night p-5 text-white shadow-[0_32px_75px_-42px_rgba(23,21,47,.9)] sm:p-8">
      <div className="grid-dots-dark absolute inset-0 opacity-45" />
      <div aria-hidden="true" className="agent-glow" />
      <div className="relative space-y-3">
        <AgentRow icon={Server} name="edge-tokyo" detail="Linux · online" tone="bg-mint" />
        <Connector />
        <AgentRow icon={Network} name="warehouse-net" detail="3 private checks" tone="bg-coral" />
        <Connector />
        <AgentRow icon={Database} name="data-volume" detail="62% used" tone="bg-lavender" />
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="ml-6 flex h-5 items-center" aria-hidden="true">
      <span className="h-full border-l border-dashed border-white/25" />
      <span className="h-px w-8 border-t border-dashed border-white/20" />
    </div>
  );
}

function AgentRow({
  icon: Icon,
  name,
  detail,
  tone,
}: {
  icon: typeof Server;
  name: string;
  detail: string;
  tone: string;
}) {
  return (
    <motion.div
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.075] p-4 backdrop-blur"
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2 }}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-night ${tone}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-bold">{name}</p>
        <p className="truncate text-sm text-white/58">{detail}</p>
      </div>
      <span className="landing-status-dot ml-auto shrink-0" />
    </motion.div>
  );
}
