import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedImage } from "./types.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function decodeBase64(value: string, label: string): Uint8Array {
  const compact = value.replace(/\s/g, "");
  if (
    compact.length === 0 ||
    compact.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    throw new Error(`${label} is not valid base64 image data.`);
  }

  const bytes = Buffer.from(compact, "base64");
  if (bytes.length === 0) {
    throw new Error(`${label} is empty.`);
  }
  return bytes;
}

export function detectImageMimeType(
  bytes: Uint8Array,
  fallback?: string,
): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return fallback;
}

function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

function looksLikePath(input: string): boolean {
  return (
    path.isAbsolute(input) ||
    input.includes("/") ||
    input.includes("\\") ||
    input.startsWith(".") ||
    Object.hasOwn(MIME_BY_EXTENSION, path.extname(input).toLowerCase())
  );
}

function parseDataUrl(input: string, index: number): ResolvedImage {
  const match = /^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]+)$/i.exec(input);
  if (!match) {
    throw new Error(
      `Reference image ${index} has an invalid data URL. Use data:image/<format>;base64,<data>.`,
    );
  }

  const declaredMimeType = match[1]!.toLowerCase();
  const bytes = decodeBase64(match[2]!, `Reference image ${index}`);
  const mimeType = detectImageMimeType(bytes, declaredMimeType) ?? declaredMimeType;

  return {
    bytes,
    mimeType,
    filename: `reference-${index}.${extensionForMimeType(mimeType)}`,
  };
}

async function readImagePath(input: string, index: number): Promise<ResolvedImage> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Reference image ${index} could not be read from path "${input}": ${detail}`,
    );
  }

  const extensionMimeType = MIME_BY_EXTENSION[path.extname(input).toLowerCase()];
  const mimeType = detectImageMimeType(bytes, extensionMimeType);
  if (!mimeType) {
    throw new Error(
      `Reference image ${index} at "${input}" has an unsupported or unrecognized format. Use PNG, JPEG, or WebP.`,
    );
  }

  return {
    bytes,
    mimeType,
    filename: path.basename(input),
  };
}

export async function resolveReferenceImage(
  input: string,
  index: number,
): Promise<ResolvedImage> {
  const value = input.trim();
  if (!value) {
    throw new Error(`Reference image ${index} is empty.`);
  }

  if (value.startsWith("data:")) {
    return parseDataUrl(value, index);
  }

  try {
    const bytes = decodeBase64(value, `Reference image ${index}`);
    const mimeType = detectImageMimeType(bytes);
    if (mimeType) {
      return {
        bytes,
        mimeType,
        filename: `reference-${index}.${extensionForMimeType(mimeType)}`,
      };
    }
  } catch {
    // A non-base64 value can still be a local path.
  }

  if (looksLikePath(value)) {
    return readImagePath(value, index);
  }

  const bytes = decodeBase64(value, `Reference image ${index}`);
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) {
    throw new Error(
      `Reference image ${index} contains base64 data with an unsupported or unrecognized format. Use PNG, JPEG, or WebP.`,
    );
  }

  return {
    bytes,
    mimeType,
    filename: `reference-${index}.${extensionForMimeType(mimeType)}`,
  };
}

export async function resolveReferenceImages(
  inputs: string[],
): Promise<ResolvedImage[]> {
  return Promise.all(inputs.map((input, index) => resolveReferenceImage(input, index + 1)));
}
