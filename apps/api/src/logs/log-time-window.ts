import { BadRequestException } from "@nestjs/common";
import type { LogSearchWindow } from "./log-search.service.js";

export interface LogRangeInput {
  query?: string;
  from?: string;
  to?: string;
}

const maximumRangeDays = 90;

export function logTimeWindow(input: LogRangeInput): LogSearchWindow {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 3_600_000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new BadRequestException("Time range is invalid");
  }
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException("The start of the time range must be before its end");
  }
  if (to.getTime() - from.getTime() > maximumRangeDays * 86_400_000) {
    throw new BadRequestException(`Time ranges can cover up to ${maximumRangeDays} days`);
  }
  return { from, to };
}
