import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requestImages } from "./client.js";
import { resolveFoundryConfig } from "./config.js";
import { resolveReferenceImages } from "./image-input.js";
import { saveGeneratedImages } from "./output.js";
import {
  OUTPUT_FORMATS,
  QUALITY_VALUES,
  type GenerateImageInput,
} from "./types.js";
import {
  APP_RESOURCE_URI,
  loadImageViewerHtml,
} from "./viewer.js";

const sizeSchema = z
  .string()
  .regex(
    /^(auto|[1-9]\d*x[1-9]\d*)$/,
    "size must be 'auto' or WIDTHxHEIGHT, for example 1024x1024 or 1536x864",
  );

const generateImageSchema = {
  prompt: z
    .string()
    .min(1)
    .max(32000)
    .describe("Text description of the image to generate or the edit to apply."),
  images: z
    .array(z.string().min(1))
    .min(1)
    .max(16)
    .optional()
    .describe(
      "Reference images for editing. Each value can be a local path, an image data URL, or raw base64.",
    ),
  n: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of images to return (1-10)."),
  size: sizeSchema
    .optional()
    .describe("Output size: 'auto' or WIDTHxHEIGHT, including supported custom sizes."),
  quality: z
    .enum(QUALITY_VALUES)
    .optional()
    .describe("Output quality: low, medium, high, xhigh, max, or auto."),
  output_format: z
    .enum(OUTPUT_FORMATS)
    .optional()
    .describe("Output file format: png, jpeg, or webp."),
  output_dir: z
    .string()
    .min(1)
    .optional()
    .describe("Optional directory in which to save the generated images."),
  output_name: z
    .string()
    .min(1)
    .default("generated")
    .describe("Filename prefix for saved images, without a directory."),
  foundry_endpoint: z
    .string()
    .optional()
    .describe(
      "Microsoft Foundry/Azure OpenAI resource endpoint. Falls back to FOUNDRY_ENDPOINT or AZURE_OPENAI_ENDPOINT.",
    ),
  foundry_api_key: z
    .string()
    .optional()
    .describe(
      "Microsoft Foundry API key. Falls back to FOUNDRY_API_KEY or AZURE_OPENAI_API_KEY.",
    ),
  foundry_deployment: z
    .string()
    .optional()
    .describe(
      "Deployment name in the Foundry resource; it can differ from the model name. Falls back to FOUNDRY_DEPLOYMENT/AZURE_OPENAI_DEPLOYMENT, then gpt-image-2.5-sunburst.",
    ),
  foundry_api_version: z
    .string()
    .optional()
    .describe(
      "Azure OpenAI data-plane API version. Falls back to FOUNDRY_API_VERSION/AZURE_OPENAI_API_VERSION, then 2025-04-01-preview.",
    ),
};

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Image request failed: ${message}` }],
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "foundry-image-mcp-server",
    version: "0.1.0",
  });

  registerAppTool(
    server,
    "generate_image",
    {
      title: "Generate or edit image",
      description:
        "Generate images from a prompt with a Microsoft Foundry GPT image deployment, or edit images when reference images are provided. Returns every image inline and can optionally save files to disk.",
      inputSchema: generateImageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI } },
    },
    async (input: GenerateImageInput & { output_name: string }) => {
      try {
        const config = resolveFoundryConfig(input);
        const referenceImages = await resolveReferenceImages(input.images ?? []);
        const generatedImages = await requestImages(config, input, referenceImages);

        let summary = `Generated ${generatedImages.length} image${generatedImages.length === 1 ? "" : "s"} with deployment "${config.deployment}".`;
        if (input.output_dir) {
          const savedPaths = await saveGeneratedImages(
            generatedImages,
            input.output_dir,
            input.output_name,
            input.output_format,
          );
          summary += `\nSaved to:\n${savedPaths.join("\n")}`;
        }

        const revisedPrompts = generatedImages
          .map((image) => image.revisedPrompt)
          .filter((value): value is string => Boolean(value));
        if (revisedPrompts.length > 0) {
          summary += `\nRevised prompt${revisedPrompts.length === 1 ? "" : "s"}:\n${revisedPrompts.join("\n")}`;
        }

        const content: ToolContent[] = [{ type: "text", text: summary }];
        for (const image of generatedImages) {
          content.push({
            type: "image",
            data: image.data,
            mimeType: image.mimeType,
          });
        }
        return { content };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppResource(
    server,
    APP_RESOURCE_URI,
    APP_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: APP_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await loadImageViewerHtml(),
        },
      ],
    }),
  );

  return server;
}
