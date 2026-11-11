import { Injectable } from "@nestjs/common";

interface TeamWindow {
  startedAt: number;
  entries: number;
}

const windowMilliseconds = 60_000;

export class LogIngestionRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`The team's log rate limit is reached; retry in ${retryAfterSeconds} seconds`);
    this.name = "LogIngestionRateLimitError";
  }
}

@Injectable()
export class LogIngestionLimiter {
  private readonly windows = new Map<string, TeamWindow>();
  private readonly entriesPerMinute = Math.min(
    Math.max(Number(process.env.MIMORII_LOG_TEAM_ENTRIES_PER_MINUTE) || 120_000, 100),
    10_000_000
  );

  take(teamId: string, entries: number, now = Date.now()): void {
    const current = this.windows.get(teamId);
    const window =
      current && now - current.startedAt < windowMilliseconds
        ? current
        : { startedAt: now, entries: 0 };
    if (window.entries + entries > this.entriesPerMinute) {
      this.windows.set(teamId, window);
      throw new LogIngestionRateLimitError(
        Math.max(1, Math.ceil((window.startedAt + windowMilliseconds - now) / 1_000))
      );
    }
    window.entries += entries;
    this.windows.set(teamId, window);
    if (this.windows.size > 10_000) this.evict(now);
  }

  private evict(now: number): void {
    for (const [teamId, window] of this.windows) {
      if (now - window.startedAt >= windowMilliseconds) this.windows.delete(teamId);
    }
  }
}
