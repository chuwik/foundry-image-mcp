import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedImage, OutputFormat } from "./types.js";

function extensionForMimeType(mimeType: string, outputFormat?: OutputFormat): string {
  if (outputFormat) {
    return outputFormat === "jpeg" ? "jpg" : outputFormat;
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

export function normalizeOutputName(value = "generated"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("output_name must not be empty.");
  }
  if (path.basename(trimmed) !== trimmed || trimmed === "." || trimmed === "..") {
    throw new Error(
      "output_name must be a filename prefix only, without directory separators.",
    );
  }
  return trimmed.replace(/\.(png|jpe?g|webp)$/i, "");
}

export async function saveGeneratedImages(
  images: GeneratedImage[],
  outputDir: string,
  outputName: string,
  outputFormat?: OutputFormat,
): Promise<string[]> {
  const prefix = normalizeOutputName(outputName);

  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not create output_dir "${outputDir}": ${detail}`);
  }

  return Promise.all(
    images.map(async (image, index) => {
      const suffix = images.length > 1 ? `-${index + 1}` : "";
      const extension = extensionForMimeType(image.mimeType, outputFormat);
      const filePath = path.resolve(outputDir, `${prefix}${suffix}.${extension}`);
      try {
        await writeFile(filePath, Buffer.from(image.data, "base64"));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not save generated image to "${filePath}": ${detail}`);
      }
      return filePath;
    }),
  );
}
