export const chartColors = {
  grid: "var(--color-line)",
  ink: "var(--color-ink)",
  lavender: "var(--color-lavender)",
  coral: "var(--color-coral)",
  danger: "var(--color-danger)",
  muted: "var(--color-muted)",
  success: "var(--color-success)",
  surface: "var(--color-surface)",
  warning: "var(--color-warning)",
  warningStrong: "var(--color-warning-strong)",
} as const;

export const chartTooltipStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 14,
  boxShadow: "var(--shadow-card)",
  color: "var(--color-ink)",
} as const;
