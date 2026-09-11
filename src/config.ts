import {
  DEFAULT_API_VERSION,
  DEFAULT_DEPLOYMENT,
  type FoundryConfig,
  type FoundryConfigInput,
} from "./types.js";

export type Environment = Record<string, string | undefined>;

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "Foundry endpoint must be an absolute HTTP(S) URL, for example https://YOUR-RESOURCE.openai.azure.com.",
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      "Foundry endpoint must use HTTP or HTTPS, for example https://YOUR-RESOURCE.openai.azure.com.",
    );
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      "Foundry endpoint must not include query parameters or a fragment. Pass only the resource endpoint.",
    );
  }

  return trimmed;
}

export function resolveFoundryConfig(
  input: FoundryConfigInput,
  env: Environment = process.env,
): FoundryConfig {
  const endpoint = firstValue(
    input.foundry_endpoint,
    env.FOUNDRY_ENDPOINT,
    env.AZURE_OPENAI_ENDPOINT,
  );
  const apiKey = firstValue(
    input.foundry_api_key,
    env.FOUNDRY_API_KEY,
    env.AZURE_OPENAI_API_KEY,
    env.AZURE_OPENAI_KEY,
  );
  const deployment =
    firstValue(
      input.foundry_deployment,
      env.FOUNDRY_DEPLOYMENT,
      env.AZURE_OPENAI_DEPLOYMENT,
      env.AZURE_OPENAI_DEPLOYMENT_NAME,
    ) ?? DEFAULT_DEPLOYMENT;
  const apiVersion =
    firstValue(
      input.foundry_api_version,
      env.FOUNDRY_API_VERSION,
      env.AZURE_OPENAI_API_VERSION,
    ) ?? DEFAULT_API_VERSION;

  const missing: string[] = [];
  if (!endpoint) {
    missing.push(
      "endpoint (pass foundry_endpoint or set FOUNDRY_ENDPOINT/AZURE_OPENAI_ENDPOINT)",
    );
  }
  if (!apiKey) {
    missing.push(
      "API key (pass foundry_api_key or set FOUNDRY_API_KEY/AZURE_OPENAI_API_KEY)",
    );
  }

  if (missing.length > 0) {
    throw new Error(`Missing Foundry configuration: ${missing.join("; ")}.`);
  }

  return {
    endpoint: normalizeEndpoint(endpoint!),
    apiKey: apiKey!,
    deployment,
    apiVersion,
  };
}
