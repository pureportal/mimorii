import { NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "./team-access.service.js";
import { TeamLogosService } from "./team-logos.service.js";

function setup() {
  const database = { get: vi.fn() };
  const access = { require: vi.fn(async () => ({})) };
  const logos = new TeamLogosService(
    database as unknown as DatabaseService,
    access as unknown as TeamAccessService
  );
  return { access, database, logos };
}

async function inputImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 360,
      height: 180,
      channels: 4,
      background: { r: 48, g: 96, b: 180, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
}

describe("team logos", () => {
  it("normalizes and stores an uploaded logo", async () => {
    const { database, logos } = setup();
    database.get.mockResolvedValueOnce({ updated_at: "2026-08-26T12:00:00.000Z" });

    const prepared = await logos.prepare(await inputImage());
    const updatedAt = await logos.store("team-1", prepared);

    expect(updatedAt).toBe("2026-08-26T12:00:00.000Z");
    expect(await sharp(prepared).metadata()).toMatchObject({
      format: "png",
      width: 128,
      height: 128,
    });
    expect(database.get).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO team_logos"),
      "team-1",
      prepared,
      expect.any(String)
    );
  });

  it("surfaces persistence failures", async () => {
    const { database, logos } = setup();
    database.get.mockResolvedValueOnce(undefined);

    await expect(logos.store("team-1", Buffer.from("image"))).rejects.toThrow(
      "Team logo could not be stored"
    );
  });

  it("authorizes logo retrieval and reports a missing logo", async () => {
    const { access, database, logos } = setup();
    database.get.mockResolvedValueOnce(undefined);

    await expect(logos.image("user-1", "team-1")).rejects.toEqual(
      new NotFoundException("Team logo not found")
    );
    expect(access.require).toHaveBeenCalledWith("user-1", "team-1", "viewer");
  });
});
