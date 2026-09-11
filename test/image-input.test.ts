import { describe, expect, it } from "vitest";
import { resolveReferenceImage } from "../src/image-input.js";

describe("resolveReferenceImage", () => {
  it("accepts an image data URL", async () => {
    const data = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    const image = await resolveReferenceImage(`data:image/png;base64,${data}`, 1);
    expect(image.mimeType).toBe("image/png");
    expect(image.filename).toBe("reference-1.png");
  });

  it("accepts raw base64 and detects the image type", async () => {
    const data = Buffer.from("ffd8ff00", "hex").toString("base64");
    const image = await resolveReferenceImage(data, 2);
    expect(image.mimeType).toBe("image/jpeg");
    expect(image.filename).toBe("reference-2.jpg");
  });

  it("reports an unreadable image path explicitly", async () => {
    await expect(
      resolveReferenceImage("missing/reference.png", 3),
    ).rejects.toThrow('Reference image 3 could not be read from path "missing/reference.png"');
  });
});
