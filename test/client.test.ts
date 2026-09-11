import { describe, expect, it, vi } from "vitest";
import {
  buildEditForm,
  buildGenerationBody,
  buildImageEndpoint,
  parseImageResponse,
  requestImages,
} from "../src/client.js";
import type { FoundryConfig, ResolvedImage } from "../src/types.js";

const config: FoundryConfig = {
  endpoint: "https://resource.openai.azure.com",
  apiKey: "super-secret-key",
  deployment: "sunburst production/v2",
  apiVersion: "2025-04-01-preview+feature",
};

const pngImage: ResolvedImage = {
  bytes: Buffer.from("89504e470d0a1a0a", "hex"),
  mimeType: "image/png",
  filename: "input.png",
};

describe("request construction", () => {
  it("normalizes and encodes deployment-scoped endpoints", () => {
    expect(buildImageEndpoint(config, "generations")).toBe(
      "https://resource.openai.azure.com/openai/deployments/sunburst%20production%2Fv2/images/generations?api-version=2025-04-01-preview%2Bfeature",
    );
  });

  it("includes only supplied generation options", () => {
    expect(
      buildGenerationBody({
        prompt: "A lighthouse",
        quality: "xhigh",
        output_format: "webp",
      }),
    ).toEqual({
      prompt: "A lighthouse",
      quality: "xhigh",
      output_format: "webp",
    });
  });

  it("uses image for one edit input and image[] for multiple inputs", () => {
    const single = buildEditForm({ prompt: "Add fog" }, [pngImage]);
    expect(single.getAll("image")).toHaveLength(1);
    expect(single.getAll("image[]")).toHaveLength(0);

    const multiple = buildEditForm(
      { prompt: "Combine these", n: 2, size: "1536x864", quality: "max" },
      [pngImage, { ...pngImage, filename: "second.png" }],
    );
    expect(multiple.getAll("image")).toHaveLength(0);
    expect(multiple.getAll("image[]")).toHaveLength(2);
    expect(multiple.get("n")).toBe("2");
    expect(multiple.get("size")).toBe("1536x864");
    expect(multiple.get("quality")).toBe("max");
  });

  it("forms a JSON generation request with api-key authentication", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("89504e470d0a1a0a", "hex").toString("base64") }],
        }),
        { status: 200 },
      ),
    );

    await requestImages(
      config,
      { prompt: "A lighthouse", output_format: "png" },
      [],
      fetchImpl,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/images/generations?");
    expect(init?.headers).toEqual({
      "api-key": "super-secret-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "A lighthouse",
      output_format: "png",
    });
  });

  it("forms a multipart edit request without overriding its content type", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("89504e470d0a1a0a", "hex").toString("base64") }],
        }),
        { status: 200 },
      ),
    );

    await requestImages(config, { prompt: "Add fog" }, [pngImage], fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/images/edits?");
    expect(init?.headers).toEqual({ "api-key": "super-secret-key" });
    expect(init?.body).toBeInstanceOf(FormData);
  });
});

describe("response parsing and errors", () => {
  it("parses b64_json images and detects their MIME type", () => {
    const data = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    expect(parseImageResponse({ data: [{ b64_json: data }] })).toEqual([
      { data, mimeType: "image/png" },
    ]);
  });

  it("rejects malformed responses with the missing field path", () => {
    expect(() => parseImageResponse({ data: [{}] })).toThrow(
      "data[0].b64_json is missing",
    );
  });

  it("rejects invalid base64 image data", () => {
    expect(() => parseImageResponse({ data: [{ b64_json: "not-base64!" }] })).toThrow(
      "data[0].b64_json is invalid",
    );
  });

  it("reports content filtering with an actionable message", () => {
    expect(() =>
      parseImageResponse({
        error: {
          inner_error: {
            code: "ResponsibleAIPolicyViolation",
          },
        },
      }),
    ).toThrow("Revise the prompt or reference images");
  });

  it("recognizes the simple contentFilter error shape", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "contentFilter",
            message: "Generated image was filtered as a result of our safety system.",
          },
        }),
        { status: 400, statusText: "Bad Request" },
      ),
    );

    await expect(
      requestImages(config, { prompt: "test" }, [], fetchImpl),
    ).rejects.toThrow("blocked the image request because of content filtering");
  });

  it("does not expose credentials in HTTP failure messages", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { message: "Request using super-secret-key was denied" },
        }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );

    await expect(
      requestImages(config, { prompt: "test" }, [], fetchImpl),
    ).rejects.toThrow("[REDACTED]");
    await expect(
      requestImages(config, { prompt: "test" }, [], fetchImpl),
    ).rejects.not.toThrow("super-secret-key");
  });
});
