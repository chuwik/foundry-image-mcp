import { describe, expect, it } from "vitest";
import { normalizeEndpoint, resolveFoundryConfig } from "../src/config.js";

describe("resolveFoundryConfig", () => {
  it("prefers per-call values over Foundry and Azure environment variables", () => {
    const config = resolveFoundryConfig(
      {
        foundry_endpoint: "https://call.example/",
        foundry_api_key: "call-key",
        foundry_deployment: "call deployment",
        foundry_api_version: "call-version",
      },
      {
        FOUNDRY_ENDPOINT: "https://foundry.example",
        FOUNDRY_API_KEY: "foundry-key",
        FOUNDRY_DEPLOYMENT: "foundry-deployment",
        FOUNDRY_API_VERSION: "foundry-version",
        AZURE_OPENAI_ENDPOINT: "https://azure.example",
        AZURE_OPENAI_API_KEY: "azure-key",
      },
    );

    expect(config).toEqual({
      endpoint: "https://call.example",
      apiKey: "call-key",
      deployment: "call deployment",
      apiVersion: "call-version",
    });
  });

  it("prefers FOUNDRY variables over standard Azure OpenAI variables", () => {
    const config = resolveFoundryConfig(
      {},
      {
        FOUNDRY_ENDPOINT: "https://foundry.example/",
        FOUNDRY_API_KEY: "foundry-key",
        FOUNDRY_DEPLOYMENT: "foundry-deployment",
        FOUNDRY_API_VERSION: "foundry-version",
        AZURE_OPENAI_ENDPOINT: "https://azure.example",
        AZURE_OPENAI_API_KEY: "azure-key",
        AZURE_OPENAI_DEPLOYMENT: "azure-deployment",
        AZURE_OPENAI_API_VERSION: "azure-version",
      },
    );

    expect(config).toEqual({
      endpoint: "https://foundry.example",
      apiKey: "foundry-key",
      deployment: "foundry-deployment",
      apiVersion: "foundry-version",
    });
  });

  it("uses documented deployment and API version defaults", () => {
    const config = resolveFoundryConfig(
      {},
      {
        AZURE_OPENAI_ENDPOINT: "https://azure.example",
        AZURE_OPENAI_KEY: "azure-key",
      },
    );

    expect(config.deployment).toBe("gpt-image-2.5-sunburst");
    expect(config.apiVersion).toBe("2025-04-01-preview");
  });

  it("reports every missing required setting without exposing values", () => {
    expect(() => resolveFoundryConfig({}, {})).toThrow(
      "Missing Foundry configuration: endpoint",
    );
    expect(() => resolveFoundryConfig({}, {})).toThrow("API key");
  });
});

describe("normalizeEndpoint", () => {
  it("removes all trailing slashes", () => {
    expect(normalizeEndpoint("https://example.openai.azure.com///")).toBe(
      "https://example.openai.azure.com",
    );
  });

  it("rejects query parameters", () => {
    expect(() => normalizeEndpoint("https://example.test?api-key=secret")).toThrow(
      "must not include query parameters",
    );
  });
});
