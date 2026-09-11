# foundry-image-mcp

A TypeScript/Node.js [Model Context Protocol](https://modelcontextprotocol.io/) server for image generation and editing with a Microsoft Foundry GPT image deployment. The `generate_image` tool returns images as MCP image content, and an [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) viewer renders the results inline in supported clients.

The default deployment name is `gpt-image-2.5-sunburst`. A deployment name is the name assigned in your Foundry resource and can differ from the underlying model name.

## Features

- Text-to-image through the deployment-scoped `/images/generations` REST endpoint.
- Image editing through `/images/edits` when one or more reference images are supplied.
- Local file paths, `data:image/...;base64,...` URLs, and raw base64 reference images.
- Inline PNG, JPEG, and WebP results from `data[].b64_json`.
- Optional image saving with deterministic filenames.
- Per-call configuration with environment-variable fallbacks.
- Explicit errors for configuration, authentication, routing, content filtering, malformed responses, network failures, and local file access.
- No credential logging or credential-bearing URLs.

## Requirements

- Node.js 20 or later.
- A Microsoft Foundry/Azure OpenAI resource with an image-capable deployment.
- The resource endpoint and an API key with access to that deployment.
- Azure OpenAI image data-plane API version `2025-04-01-preview` or later.

## Install

```console
git clone https://github.com/chuwik/foundry-image-mcp.git
cd foundry-image-mcp
npm install
npm run build
```

Copy `.env.example` only if your MCP client or process manager loads `.env` files. The server itself reads process environment variables and does not automatically load `.env`.

## Configuration

Configuration precedence is:

1. Values passed to `generate_image`.
2. `FOUNDRY_*` environment variables.
3. Standard `AZURE_OPENAI_*` environment variables.
4. Documented defaults for deployment and API version.

| Tool argument | Preferred environment variable | Azure fallback | Default |
| --- | --- | --- | --- |
| `foundry_endpoint` | `FOUNDRY_ENDPOINT` | `AZURE_OPENAI_ENDPOINT` | Required |
| `foundry_api_key` | `FOUNDRY_API_KEY` | `AZURE_OPENAI_API_KEY`, then `AZURE_OPENAI_KEY` | Required |
| `foundry_deployment` | `FOUNDRY_DEPLOYMENT` | `AZURE_OPENAI_DEPLOYMENT`, then `AZURE_OPENAI_DEPLOYMENT_NAME` | `gpt-image-2.5-sunburst` |
| `foundry_api_version` | `FOUNDRY_API_VERSION` | `AZURE_OPENAI_API_VERSION` | `2025-04-01-preview` |

Set the endpoint to the resource root, without a deployment path:

```text
https://YOUR-RESOURCE.openai.azure.com
```

Trailing slashes are accepted and removed. Deployment names and API versions are URL-encoded when the request URL is built.

### VS Code

Add `.vscode/mcp.json` to the workspace that will use the server. Replace the path and values:

```json
{
  "servers": {
    "foundry-image": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\absolute\\path\\to\\foundry-image-mcp\\dist\\index.js"
      ],
      "env": {
        "FOUNDRY_ENDPOINT": "https://YOUR-RESOURCE.openai.azure.com",
        "FOUNDRY_API_KEY": "${input:foundry-image-key}",
        "FOUNDRY_DEPLOYMENT": "gpt-image-2.5-sunburst",
        "FOUNDRY_API_VERSION": "2025-04-01-preview"
      }
    }
  },
  "inputs": [
    {
      "id": "foundry-image-key",
      "type": "promptString",
      "description": "Microsoft Foundry API key",
      "password": true
    }
  ]
}
```

You can also place the server in your user-level MCP configuration. Restart or reload MCP servers after building or changing configuration.

### Claude Desktop

Add the server to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "foundry-image": {
      "command": "node",
      "args": [
        "C:\\absolute\\path\\to\\foundry-image-mcp\\dist\\index.js"
      ],
      "env": {
        "FOUNDRY_ENDPOINT": "https://YOUR-RESOURCE.openai.azure.com",
        "FOUNDRY_API_KEY": "YOUR_API_KEY",
        "FOUNDRY_DEPLOYMENT": "gpt-image-2.5-sunburst",
        "FOUNDRY_API_VERSION": "2025-04-01-preview"
      }
    }
  }
}
```

Use an absolute path. On macOS or Linux, use the corresponding POSIX path instead of the Windows example.

## Tool: `generate_image`

| Argument | Type | Description |
| --- | --- | --- |
| `prompt` | string | Required image description or edit instruction, up to 32,000 characters. |
| `images` | string[] | Optional reference images, up to 16. Supplying at least one switches the request to image editing. |
| `n` | integer | Number of images, from 1 through 10. Omitted values use the service default. |
| `size` | string | `auto` or `WIDTHxHEIGHT`, such as `1024x1024`, `1536x1024`, or a custom size supported by the deployment. |
| `quality` | string | `low`, `medium`, `high`, `xhigh`, `max`, or `auto`. |
| `output_format` | string | `png`, `jpeg`, or `webp`. |
| `output_dir` | string | Optional directory in which to save the generated images. |
| `output_name` | string | Filename prefix, without a directory. Defaults to `generated`. |
| `foundry_endpoint` | string | Per-call resource endpoint override. |
| `foundry_api_key` | string | Per-call API key override. Environment configuration is safer. |
| `foundry_deployment` | string | Per-call deployment-name override. |
| `foundry_api_version` | string | Per-call API-version override. |

Only optional values supplied to the tool are sent to Foundry. The service and selected deployment remain the authority on which custom dimensions and quality tiers are available.

### Generate an image

```json
{
  "prompt": "A clean editorial illustration of a solar-powered research station in Antarctica",
  "n": 2,
  "size": "1536x1024",
  "quality": "high",
  "output_format": "webp"
}
```

### Edit one image

```json
{
  "prompt": "Keep the subject unchanged and replace the background with a misty pine forest",
  "images": [
    "C:\\images\\portrait.png"
  ],
  "quality": "xhigh",
  "output_format": "png"
}
```

For one reference image, the multipart request uses the `image` field.

### Edit with multiple references

```json
{
  "prompt": "Use the composition of the first image and the color palette of the second",
  "images": [
    "data:image/png;base64,iVBORw0KGgo...",
    "/absolute/path/to/palette.jpg"
  ],
  "size": "2048x1024",
  "quality": "max",
  "output_format": "jpeg",
  "output_dir": "./generated",
  "output_name": "combined-concept"
}
```

For multiple reference images, the multipart request repeats the documented `image[]` field. Images must be PNG, JPEG, or WebP and readable by the local MCP server process.

### Configure a single call

Per-call values are useful when one server needs to target several deployments:

```json
{
  "prompt": "A product photograph of a translucent blue mechanical keyboard",
  "foundry_endpoint": "https://YOUR-RESOURCE.openai.azure.com",
  "foundry_deployment": "my-sunburst-production-deployment",
  "foundry_api_version": "2025-04-01-preview"
}
```

Avoid passing `foundry_api_key` in routine calls because tool arguments can be retained in chat history or client logs. Prefer the MCP server's environment.

## Request behavior

Text generation sends:

```http
POST {endpoint}/openai/deployments/{deployment}/images/generations?api-version={apiVersion}
api-key: ...
Content-Type: application/json
```

Editing sends multipart form data to the corresponding `/images/edits` route. The server does not manually set the multipart `Content-Type`, allowing the Node.js `FormData` implementation to add the required boundary.

Successful responses must contain one or more `data[].b64_json` values. Every image is returned as standard MCP image content for clients without MCP Apps support, while compatible clients can show the bundled inline viewer. If `output_dir` is supplied, the same decoded images are also written to disk.

## Security

- Treat the API key as a secret. Keep it in the MCP process environment or a secret manager, not source control.
- Never commit a populated `.env`; `.gitignore` excludes it.
- Per-call keys can appear in conversation history, tool traces, or client logs. Use them only when necessary.
- The server redacts the configured key if a remote or network error repeats it, but upstream clients may record tool inputs before the request runs.
- Reference paths and `output_dir` operate with the permissions of the local MCP server process. Limit that process to files and directories it should access.
- Review generated content before publishing or using it in consequential workflows.

## Errors

Tool failures are returned as MCP error results with a specific corrective action. Common cases include:

- Missing endpoint or API key, including the accepted argument and environment-variable names.
- `401`/`403` authentication or authorization failures.
- `404` endpoint, deployment, route, or API-version mismatches.
- `429` quota and rate-limit responses.
- `ResponsibleAIPolicyViolation` and filtered response metadata.
- Missing or invalid `data[].b64_json`.
- Unreadable local image paths and unsupported image data.
- Output directory creation or file-write failures.

Credentials are never included in request URLs, normal output, or server logs.

## Development

```console
npm install
npm test
npm run build
```

Tests cover configuration precedence, endpoint normalization and encoding, JSON generation requests, single- and multi-image multipart edit requests, base64 response parsing, input formats, and actionable error messages. HTTP tests use injected `fetch` implementations; no live Foundry request is made without credentials.

To run the TypeScript entry point during development:

```console
npm run dev
```

The stdio transport reserves standard output for MCP protocol messages. Fatal startup errors are written to standard error.

## Attribution and documentation

This project is conceptually and structurally derived from [pierceboggan/nano-banana-mcp](https://github.com/pierceboggan/nano-banana-mcp) at commit [`80ce5b0009c773fdf08f49f6047b8a4732d9a2fd`](https://github.com/pierceboggan/nano-banana-mcp/tree/80ce5b0009c773fdf08f49f6047b8a4732d9a2fd), under the MIT License. It preserves the inline image result and MCP Apps viewer experience while separating the Foundry API, configuration, image input, output, and UI concerns for focused testing.

The REST behavior follows Microsoft's [Azure OpenAI image and audio REST API reference for `2025-04-01-preview`](https://learn.microsoft.com/en-us/azure/foundry/openai/reference-preview): deployment-scoped image routes, `api-key` authentication, multipart editing, and base64 image responses for GPT image models.
