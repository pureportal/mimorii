import type { TeamRole } from "@mimorii/contracts";

export type ExportValue = string | number | boolean | null;
export type ExportRow = Readonly<Record<string, ExportValue>>;

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportRequest {
  userId: string;
  teamId: string;
  from: Date;
  to: Date;
  filters: Readonly<Record<string, string>>;
}

export abstract class ExportDataset {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly columns: readonly ExportColumn[];
  readonly minimumRole: TeamRole = "viewer";
  readonly usesTimeRange: boolean = false;
  readonly filters: readonly string[] = [];

  abstract rows(request: ExportRequest): AsyncIterable<ExportRow>;

  filename(request: ExportRequest): string {
    const day = (value: Date) => value.toISOString().slice(0, 10);
    return this.usesTimeRange
      ? `mimorii-${this.id}-${day(request.from)}-to-${day(request.to)}`
      : `mimorii-${this.id}-${day(new Date())}`;
  }

  protected async *pages<T, C>(
    load: (cursor: C | null, limit: number) => Promise<T[]>,
    cursorOf: (row: T) => C,
    pageSize = 1_000
  ): AsyncIterable<T> {
    let cursor: C | null = null;
    for (;;) {
      const rows = await load(cursor, pageSize);
      yield* rows;
      if (rows.length < pageSize) return;
      cursor = cursorOf(rows.at(-1)!);
    }
  }
}
