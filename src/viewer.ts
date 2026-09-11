import { readFile } from "node:fs/promises";

export const APP_RESOURCE_URI = "ui://generate-image/app.html";

export function buildImageViewerHtml(appSdkJs: string): string {
  const appVariable = appSdkJs.match(
    /\bexport\{[^}]*\b(\w+)\s+as\s+App\b/,
  )?.[1];
  if (!appVariable) {
    throw new Error("Could not find the App export in the MCP Apps browser bundle.");
  }

  const sdkCode = appSdkJs.replace(/export\{[^}]+\};\s*$/, "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Generated images</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; padding: 16px; background: Canvas; color: CanvasText; }
    #status, #error, #caption { font-size: 14px; line-height: 1.45; }
    #status { color: GrayText; }
    #error { color: #c62828; display: none; }
    #images { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 12px; }
    figure { margin: 0; min-width: 0; }
    img { display: block; width: 100%; height: auto; border-radius: 10px; background: #eee; box-shadow: 0 2px 10px rgb(0 0 0 / 16%); }
    #caption { margin-top: 12px; color: GrayText; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="status" role="status" aria-live="polite">Generating image...</div>
  <div id="error" role="alert"></div>
  <div id="images" aria-label="Generated images"></div>
  <div id="caption"></div>
  <script type="module">
${sdkCode}
const statusElement = document.getElementById("status");
const errorElement = document.getElementById("error");
const imagesElement = document.getElementById("images");
const captionElement = document.getElementById("caption");
const app = new ${appVariable}({ name: "Foundry Image Viewer", version: "0.1.0" });

app.ontoolresult = (result) => {
  statusElement.style.display = "none";
  imagesElement.replaceChildren();
  errorElement.style.display = "none";

  const content = result.content ?? [];
  const text = content.filter((item) => item.type === "text").map((item) => item.text).join("\\n").trim();
  captionElement.textContent = text;

  if (result.isError) {
    errorElement.textContent = text || "The image request failed.";
    errorElement.style.display = "block";
    return;
  }

  const images = content.filter((item) => item.type === "image");
  if (images.length === 0) {
    statusElement.textContent = text || "No image was returned.";
    statusElement.style.display = "block";
    return;
  }

  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    const element = document.createElement("img");
    element.src = \`data:\${image.mimeType};base64,\${image.data}\`;
    element.alt = images.length === 1 ? "Generated image" : \`Generated image \${index + 1}\`;
    element.loading = "lazy";
    figure.appendChild(element);
    imagesElement.appendChild(figure);
  });
};

app.connect().catch((error) => {
  statusElement.textContent = error?.message ?? String(error);
});
  </script>
</body>
</html>`;
}

export async function loadImageViewerHtml(): Promise<string> {
  const sdkUrl = new URL(
    "../node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js",
    import.meta.url,
  );
  const appSdkJs = await readFile(sdkUrl, "utf8");
  return buildImageViewerHtml(appSdkJs);
}
