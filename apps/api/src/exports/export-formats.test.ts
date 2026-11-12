import { describe, expect, it } from "vitest";
import type { ExportRow } from "./export-dataset.js";
import { CsvExportFormat, JsonExportFormat, NdjsonExportFormat } from "./export-formats.js";

const columns = [
  { key: "name", label: "Name" },
  { key: "count", label: "Count" },
  { key: "note", label: "Note" },
];

async function* rows(): AsyncIterable<ExportRow> {
  yield { name: 'API "edge", primary', count: 3, note: '=HYPERLINK("x")' };
  yield { name: "Worker", count: 0, note: null };
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

describe("export formats", () => {
  it("writes CSV with quoting and neutralized formulas", async () => {
    const csv = await collect(new CsvExportFormat().encode(columns, rows()));
    expect(csv).toBe(
      '﻿Name,Count,Note\r\n"API ""edge"", primary",3,"\'=HYPERLINK(""x"")"\r\nWorker,0,\r\n'
    );
  });

  it("writes JSON arrays and NDJSON lines keyed by column", async () => {
    const json = await collect(new JsonExportFormat().encode(columns, rows()));
    expect(JSON.parse(json)).toEqual([
      { name: 'API "edge", primary', count: 3, note: '=HYPERLINK("x")' },
      { name: "Worker", count: 0, note: null },
    ]);
    async function* empty(): AsyncIterable<ExportRow> {}
    expect(await collect(new JsonExportFormat().encode(columns, empty()))).toBe("[]\n");
    const ndjson = await collect(new NdjsonExportFormat().encode(columns, rows()));
    expect(
      ndjson
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown)
    ).toHaveLength(2);
  });
});
