import { beforeEach, describe, expect, it, vi } from "vitest";

const scanner = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-barcode-scanner", () => ({
  checkPermissions: scanner.checkPermissions,
  Format: { QRCode: "QR_CODE" },
  requestPermissions: scanner.requestPermissions,
  scan: scanner.scan,
}));

import { scanEnrollmentCode } from "./enrollment-scanner";

describe("enrollment QR scanner", () => {
  beforeEach(() => {
    scanner.checkPermissions.mockReset();
    scanner.requestPermissions.mockReset();
    scanner.scan.mockReset();
  });

  it("requests camera permission and returns only QR content", async () => {
    scanner.checkPermissions.mockResolvedValue("prompt");
    scanner.requestPermissions.mockResolvedValue("granted");
    scanner.scan.mockResolvedValue({
      content: "mimorii-agent://enroll?server=example&key=secret",
      format: "QR_CODE",
      bounds: null,
    });

    await expect(scanEnrollmentCode()).resolves.toBe(
      "mimorii-agent://enroll?server=example&key=secret"
    );
    expect(scanner.scan).toHaveBeenCalledWith({
      cameraDirection: "back",
      formats: ["QR_CODE"],
    });
  });

  it("explains how to recover when camera access is denied", async () => {
    scanner.checkPermissions.mockResolvedValue("denied");

    await expect(scanEnrollmentCode()).rejects.toThrow("Allow camera access to scan a QR code");
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it("does not expose native scanner errors", async () => {
    scanner.checkPermissions.mockResolvedValue("granted");
    scanner.scan.mockRejectedValue(new Error("Native scanner session failed with code 7"));

    await expect(scanEnrollmentCode()).rejects.toThrow("QR code could not be scanned");
  });
});
