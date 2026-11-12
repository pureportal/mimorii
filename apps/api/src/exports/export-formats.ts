import type { ExportFormatId } from "@mimorii/contracts";
import type { ExportColumn, ExportRow, ExportValue } from "./export-dataset.js";

export abstract class ExportFormat {
  abstract readonly id: ExportFormatId;
  abstract readonly mediaType: string;
  abstract readonly extension: string;

  abstract encode(
    columns: readonly ExportColumn[],
    rows: AsyncIterable<ExportRow>
  ): AsyncIterable<string>;
}

const formulaPrefix = /^[=+\-@\t\r]/;

export class CsvExportFormat extends ExportFormat {
  readonly id = "csv";
  readonly mediaType = "text/csv; charset=utf-8";
  readonly extension = "csv";

  async *encode(columns: readonly ExportColumn[], rows: AsyncIterable<ExportRow>) {
    yield `﻿${columns.map((column) => csvCell(column.label)).join(",")}\r\n`;
    for await (const row of rows) {
      yield `${columns.map((column) => csvCell(row[column.key] ?? null)).join(",")}\r\n`;
    }
  }
}

export class JsonExportFormat extends ExportFormat {
  readonly id = "json";
  readonly mediaType = "application/json; charset=utf-8";
  readonly extension = "json";

  async *encode(columns: readonly ExportColumn[], rows: AsyncIterable<ExportRow>) {
    yield "[";
    let first = true;
    for await (const row of rows) {
      yield `${first ? "\n" : ",\n"}${JSON.stringify(pick(columns, row))}`;
      first = false;
    }
    yield first ? "]\n" : "\n]\n";
  }
}

export class NdjsonExportFormat extends ExportFormat {
  readonly id = "ndjson";
  readonly mediaType = "application/x-ndjson; charset=utf-8";
  readonly extension = "ndjson";

  async *encode(columns: readonly ExportColumn[], rows: AsyncIterable<ExportRow>) {
    for await (const row of rows) yield `${JSON.stringify(pick(columns, row))}\n`;
  }
}

function pick(columns: readonly ExportColumn[], row: ExportRow): Record<string, ExportValue> {
  return Object.fromEntries(columns.map((column) => [column.key, row[column.key] ?? null]));
}

function csvCell(value: ExportValue): string {
  if (value === null) return "";
  const text = String(value);
  const safe = typeof value === "string" && formulaPrefix.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
