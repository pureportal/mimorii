import type { LogFieldSummary, LogLabelSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { logQueryCompletions, type LogCompletion } from "./log-query-completion";

const source = {
  labels: [
    {
      name: "service",
      valueCount: 2,
      values: [
        { value: "checkout", streams: 4 },
        { value: "search", streams: 2 },
      ],
    },
    { name: "env", valueCount: 1, values: [{ value: "prod", streams: 6 }] },
  ] satisfies LogLabelSummary[],
  fields: [
    {
      name: "status",
      count: 120,
      numeric: true,
      values: [
        { value: "200", count: 100 },
        { value: "500", count: 20 },
      ],
    },
    { name: "route", count: 40, numeric: false, values: [{ value: "/api/cart", count: 40 }] },
  ] satisfies LogFieldSummary[],
};

function complete(text: string, caret = text.length) {
  return logQueryCompletions(text, caret, source);
}

function apply(text: string, completion: LogCompletion) {
  return {
    text: text.slice(0, completion.from) + completion.text + text.slice(completion.to),
    caret: completion.caret,
  };
}

describe("log query completions", () => {
  it("suggests selectors for an empty query and places the caret inside the quotes", () => {
    const [first] = complete("");
    expect(first!.label).toBe("{service}");
    expect(apply("", first!)).toEqual({ text: '{service=""}', caret: 10 });
  });

  it("completes label names and values inside a selector", () => {
    expect(complete("{se").map((completion) => completion.label)).toEqual(["service"]);
    const named = apply("{se}", complete("{se}", 3)[0]!);
    expect(named).toEqual({ text: '{service=""}', caret: 10 });

    const values = complete(named.text, named.caret);
    expect(values.map((completion) => [completion.label, completion.detail])).toEqual([
      ["checkout", "4"],
      ["search", "2"],
    ]);
    expect(apply(named.text, values[1]!)).toEqual({ text: '{service="search"}', caret: 17 });
    expect(complete('{service="ch').map((completion) => completion.label)).toEqual([
      "checkout",
      "search",
    ]);
    expect(complete("{level=").map((completion) => completion.text)).toContain('"error"}');
  });

  it("closes an open selector after a value so the pipeline can follow", () => {
    const open = '{service="che';
    expect(apply(open, complete(open)[0]!)).toEqual({ text: '{service="checkout"}', caret: 20 });
    const quoted = '{service="che"';
    expect(apply(quoted, complete(quoted, 13)[0]!)).toEqual({
      text: '{service="checkout"}',
      caret: 20,
    });
    const another = '{service="che", env="prod"}';
    expect(apply(another, complete(another, 13)[0]!).text).toBe('{service="checkout", env="prod"}');
  });

  it("completes field names and typed field values in the pipeline", () => {
    expect(complete('{env="prod"} | st').map((completion) => completion.label)).toEqual(["status"]);
    const field = apply("| st", complete("| st")[0]!);
    expect(field).toEqual({ text: "| status = ", caret: 11 });
    expect(complete(field.text).map((completion) => completion.text)).toEqual(["200", "500"]);
    expect(complete("| route = ").map((completion) => completion.text)).toEqual(['"/api/cart"']);
  });

  it("offers line filters after a selector and nothing inside free text", () => {
    expect(complete('{env="prod"} ').map((completion) => completion.text)).toEqual([
      '|= ""',
      '!= ""',
      '|~ ""',
      '!~ ""',
    ]);
    expect(complete('{env="prod"} |= "time')).toEqual([]);
  });
});
