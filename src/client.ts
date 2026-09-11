import { detectImageMimeType } from "./image-input.js";
import type {
  FoundryConfig,
  GeneratedImage,
  ImageOptions,
  OutputFormat,
  ResolvedImage,
} from "./types.js";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ImageOperation = "generations" | "edits";

export function buildImageEndpoint(
  config: Pick<FoundryConfig, "endpoint" | "deployment" | "apiVersion">,
  operation: ImageOperation,
): string {
  const deployment = encodeURIComponent(config.deployment);
  const apiVersion = encodeURIComponent(config.apiVersion);
  return `${config.endpoint}/openai/deployments/${deployment}/images/${operation}?api-version=${apiVersion}`;
}

export function buildGenerationBody(options: ImageOptions): Record<string, unknown> {
  return {
    prompt: options.prompt,
    ...(options.n !== undefined ? { n: options.n } : {}),
    ...(options.size !== undefined ? { size: options.size } : {}),
    ...(options.quality !== undefined ? { quality: options.quality } : {}),
    ...(options.output_format !== undefined
      ? { output_format: options.output_format }
      : {}),
  };
}

export function buildEditForm(
  options: ImageOptions,
  images: ResolvedImage[],
): FormData {
  if (images.length === 0) {
    throw new Error("At least one reference image is required for an edit request.");
  }

  const form = new FormData();
  form.append("prompt", options.prompt);

  const fieldName = images.length === 1 ? "image" : "image[]";
  for (const image of images) {
    const bytes = Buffer.from(image.bytes);
    form.append(
      fieldName,
      new Blob([bytes], { type: image.mimeType }),
      image.filename,
    );
  }

  if (options.n !== undefined) {
    form.append("n", String(options.n));
  }
  if (options.size !== undefined) {
    form.append("size", options.size);
  }
  if (options.quality !== undefined) {
    form.append("quality", options.quality);
  }
  if (options.output_format !== undefined) {
    form.append("output_format", options.output_format);
  }

  return form;
}

function mimeTypeForFormat(format: OutputFormat | undefined): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function isFiltered(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  if (record.filtered === true) {
    return true;
  }

  return Object.values(record).some(isFiltered);
}

function contentFilterDetail(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const error = asRecord(root?.error);
  const innerError = asRecord(error?.inner_error ?? error?.innerError);
  const code = innerError?.code ?? error?.code ?? root?.code;
  const normalizedCode = typeof code === "string" ? code.toLowerCase() : "";

  if (
    normalizedCode === "responsibleaipolicyviolation" ||
    normalizedCode === "contentfilter" ||
    isFiltered(innerError?.content_filter_results) ||
    isFiltered(root?.content_filter_results) ||
    isFiltered(root?.prompt_filter_results)
  ) {
    return typeof code === "string" ? code : "content filter";
  }

  return undefined;
}

function errorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const root = asRecord(payload);
  const error = asRecord(root?.error);
  const message = error?.message ?? root?.message;
  return typeof message === "string" && message.trim() ? message.trim() : undefined;
}

function redact(value: string, secrets: string[]): string {
  return secrets.reduce(
    (result, secret) => (secret ? result.split(secret).join("[REDACTED]") : result),
    value,
  );
}

export function parseImageResponse(
  payload: unknown,
  outputFormat?: OutputFormat,
): GeneratedImage[] {
  const root = asRecord(payload);
  if (!root) {
    throw new Error("Foundry returned a malformed image response: expected a JSON object.");
  }

  const filter = contentFilterDetail(root);
  if (filter) {
    throw new Error(
      `Foundry blocked the image request because of content filtering (${filter}). Revise the prompt or reference images and try again.`,
    );
  }

  if (!Array.isArray(root.data) || root.data.length === 0) {
    throw new Error(
      "Foundry returned a malformed image response: data must be a non-empty array.",
    );
  }

  return root.data.map((item, index) => {
    const record = asRecord(item);
    const base64 = record?.b64_json;
    if (typeof base64 !== "string" || !base64.trim()) {
      throw new Error(
        `Foundry returned a malformed image response: data[${index}].b64_json is missing.`,
      );
    }

    const compactBase64 = base64.replace(/\s/g, "");
    if (
      compactBase64.length % 4 === 1 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(compactBase64)
    ) {
      throw new Error(
        `Foundry returned a malformed image response: data[${index}].b64_json is invalid.`,
      );
    }
    const bytes = Buffer.from(compactBase64, "base64");
    if (bytes.length === 0) {
      throw new Error(
        `Foundry returned a malformed image response: data[${index}].b64_json is empty.`,
      );
    }

    const revisedPrompt =
      typeof record?.revised_prompt === "string" ? record.revised_prompt : undefined;

    return {
      data: compactBase64,
      mimeType:
        detectImageMimeType(bytes) ?? mimeTypeForFormat(outputFormat),
      ...(revisedPrompt ? { revisedPrompt } : {}),
    };
  });
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildHttpError(
  response: Response,
  payload: unknown,
  apiKey: string,
): Error {
  const filter = contentFilterDetail(payload);
  const detail = errorMessage(payload);
  const status = `${response.status} ${response.statusText}`.trim();

  if (filter) {
    return new Error(
      `Foundry blocked the image request because of content filtering (HTTP ${status}, ${filter}). Revise the prompt or reference images and try again.`,
    );
  }

  let action = "Check the endpoint, deployment, API version, and request options.";
  if (response.status === 401 || response.status === 403) {
    action = "Check the Foundry endpoint and API key permissions.";
  } else if (response.status === 404) {
    action =
      "Check that the endpoint, deployment name, route, and API version are correct.";
  } else if (response.status === 429) {
    action = "Wait and retry, or review the deployment quota and rate limits.";
  }

  const safeDetail = detail ? ` ${redact(detail, [apiKey])}` : "";
  return new Error(`Foundry image request failed (HTTP ${status}).${safeDetail} ${action}`);
}

export async function requestImages(
  config: FoundryConfig,
  options: ImageOptions,
  referenceImages: ResolvedImage[],
  fetchImpl: FetchLike = fetch,
): Promise<GeneratedImage[]> {
  const isEdit = referenceImages.length > 0;
  const operation: ImageOperation = isEdit ? "edits" : "generations";
  const url = buildImageEndpoint(config, operation);
  const body = isEdit
    ? buildEditForm(options, referenceImages)
    : JSON.stringify(buildGenerationBody(options));
  const headers: Record<string, string> = {
    "api-key": config.apiKey,
    ...(!isEdit ? { "Content-Type": "application/json" } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach the Foundry image endpoint: ${redact(detail, [config.apiKey])}. Check network access and foundry_endpoint.`,
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw buildHttpError(response, payload, config.apiKey);
  }

  return parseImageResponse(payload, options.output_format);
}
