# foundry-image-mcp

An MCP server for generating and editing images with a Microsoft Foundry GPT image deployment. Generated images render inline in clients that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview).

## Features

- Generate images from text prompts
- Edit or combine PNG, JPEG, and WebP reference images
- Render results inline through MCP Apps
- Optionally save generated images to disk

## Quick start

Requires Node.js 20 or later and a Microsoft Foundry image deployment.

```bash
git clone https://github.com/chuwik/foundry-image-mcp.git
cd foundry-image-mcp
npm install
npm run build
```

Set these environment variables in your MCP client:

```text
FOUNDRY_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
FOUNDRY_API_KEY=YOUR_API_KEY
FOUNDRY_DEPLOYMENT=gpt-image-2.5-sunburst
```

`FOUNDRY_DEPLOYMENT` is optional when your deployment uses the default name above. You can also set `FOUNDRY_API_VERSION`; it defaults to `2025-04-01-preview`.

## Tool: `generate_image`

The server exposes one tool for both generation and editing.

| Parameter | Required | Description |
| --- | --- | --- |
| `prompt` | Yes | What to generate or how to edit the reference images |
| `images` | No | Reference image paths, data URLs, or base64 strings |
| `n` | No | Number of images, from 1 to 10 |
| `size` | No | `auto` or a supported size such as `1024x1024` |
| `quality` | No | `low`, `medium`, `high`, `xhigh`, `max`, or `auto` |
| `output_format` | No | `png`, `jpeg`, or `webp` |
| `output_dir` | No | Directory in which to save generated images |
| `output_name` | No | Saved filename prefix; defaults to `generated` |

Examples:

- **Generate:** `"A minimalist app icon for a hiking app, flat design, forest green"`
- **Edit:** `"Replace the background with a misty pine forest"` with `images: ["./portrait.png"]`
- **Combine:** `"Use the layout of the first image and colors of the second"` with `images: ["./layout.png", "./palette.jpg"]`

Endpoint, key, deployment, and API version can also be overridden per call with the corresponding `foundry_*` parameters. Prefer environment variables for API keys so credentials do not appear in chat history or tool logs.

## GitHub Copilot setup

Copilot CLI and the GitHub Copilot app use the user-level MCP configuration at `~/.copilot/mcp-config.json` (`%USERPROFILE%\.copilot\mcp-config.json` on Windows). Add:

```json
{
  "mcpServers": {
    "foundry-image": {
      "type": "local",
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\foundry-image-mcp\\dist\\index.js"],
      "env": {
        "FOUNDRY_ENDPOINT": "https://YOUR-RESOURCE.openai.azure.com",
        "FOUNDRY_API_KEY": "YOUR_API_KEY",
        "FOUNDRY_DEPLOYMENT": "gpt-image-2.5-sunburst"
      },
      "tools": ["generate_image"]
    }
  }
}
```

Start a new Copilot session after saving the file. In Copilot CLI, run `/mcp show foundry-image` to verify the server, then ask Copilot to generate or edit an image.

## Codex setup

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.foundry-image]
command = "node"
args = ["C:\\absolute\\path\\to\\foundry-image-mcp\\dist\\index.js"]
enabled_tools = ["generate_image"]

[mcp_servers.foundry-image.env]
FOUNDRY_ENDPOINT = "https://YOUR-RESOURCE.openai.azure.com"
FOUNDRY_API_KEY = "YOUR_API_KEY"
FOUNDRY_DEPLOYMENT = "gpt-image-2.5-sunburst"
```

Restart Codex after saving the file, then run `codex mcp list` to verify the server.

## Claude Desktop configuration

Add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "foundry-image": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\foundry-image-mcp\\dist\\index.js"],
      "env": {
        "FOUNDRY_ENDPOINT": "https://YOUR-RESOURCE.openai.azure.com",
        "FOUNDRY_API_KEY": "YOUR_API_KEY",
        "FOUNDRY_DEPLOYMENT": "gpt-image-2.5-sunburst"
      }
    }
  }
}
```

Use an absolute path and restart the MCP client after changing its configuration.

## Development

```bash
npm run dev    # Run with tsx
npm test       # Run tests
npm run build  # Compile TypeScript
npm start      # Run compiled output
```

This project is derived from [pierceboggan/nano-banana-mcp](https://github.com/pierceboggan/nano-banana-mcp/tree/80ce5b0009c773fdf08f49f6047b8a4732d9a2fd) under the MIT License.
