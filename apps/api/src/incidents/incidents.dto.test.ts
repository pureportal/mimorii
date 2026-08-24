import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { AddIncidentUpdateDto } from "./incidents.dto.js";

describe("AddIncidentUpdateDto", () => {
  it("accepts an empty update message", async () => {
    const input = new AddIncidentUpdateDto();
    input.status = "monitoring";
    input.message = "";

    expect(await validate(input)).toEqual([]);
  });

  it("keeps the update message length limit", async () => {
    const input = new AddIncidentUpdateDto();
    input.status = "monitoring";
    input.message = "a".repeat(2_001);

    expect(await validate(input)).toEqual([expect.objectContaining({ property: "message" })]);
  });
});
