export const DEFAULT_API_VERSION = "2025-04-01-preview";
export const DEFAULT_DEPLOYMENT = "gpt-image-2.5-sunburst";

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const QUALITY_VALUES = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
] as const;
export type ImageQuality = (typeof QUALITY_VALUES)[number];

export interface FoundryConfigInput {
  foundry_endpoint?: string;
  foundry_api_key?: string;
  foundry_deployment?: string;
  foundry_api_version?: string;
}

export interface FoundryConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

export interface ImageOptions {
  prompt: string;
  n?: number;
  size?: string;
  quality?: ImageQuality;
  output_format?: OutputFormat;
}

export interface GenerateImageInput
  extends FoundryConfigInput,
    ImageOptions {
  images?: string[];
  output_dir?: string;
  output_name?: string;
}

export interface ResolvedImage {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}

export interface GeneratedImage {
  data: string;
  mimeType: string;
  revisedPrompt?: string;
}
