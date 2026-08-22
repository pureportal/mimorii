import {
  checkPermissions,
  Format,
  requestPermissions,
  scan,
} from "@tauri-apps/plugin-barcode-scanner";

export async function scanEnrollmentCode(): Promise<string> {
  try {
    let permission = await checkPermissions();
    if (permission === "prompt") {
      permission = await requestPermissions();
    }
    if (permission !== "granted") {
      throw new CameraPermissionError();
    }
    const result = await scan({ cameraDirection: "back", formats: [Format.QRCode] });
    return result.content;
  } catch (error) {
    if (error instanceof CameraPermissionError) throw error;
    throw new Error("QR code could not be scanned", { cause: error });
  }
}

class CameraPermissionError extends Error {
  constructor() {
    super("Allow camera access to scan a QR code");
  }
}
