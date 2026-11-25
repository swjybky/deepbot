import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ImageProcessor } from "@earendil-works/pi-durable/tools";
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_LIMIT, CHAT_IMAGE_PIXELS, CHAT_IMAGE_TOTAL_BYTES, type ChatImage, type ChatImageUpload } from "../protocol.ts";

function imageHeader(bytes: Buffer) {
  if (bytes.length >= 24 && bytes.toString("hex", 0, 8) === "89504e470d0a1a0a" && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    // JPEG dimensions are in the first start-of-frame segment, after any metadata.
    for (let offset = 2; offset + 8 < bytes.length && bytes[offset] === 0xff;) {
      while (bytes[offset] === 0xff) offset++;
      if (offset + 7 >= bytes.length) break;
      const marker = bytes[offset++]!;
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
        return { mimeType: "image/jpeg", width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const mimeType = "image/webp";
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mimeType, width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21);
      return { mimeType, width: 1 + (dimensions & 0x3fff), height: 1 + ((dimensions >>> 14) & 0x3fff) };
    }
    if (chunk === "VP8 " && bytes.toString("hex", 23, 26) === "9d012a") {
      return { mimeType, width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  throw new Error("无法读取图片，请选择有效的 PNG、JPEG 或 WebP");
}

export async function saveChatImages(dataDir: string, uploads: ChatImageUpload[], processor: ImageProcessor): Promise<ChatImage[]> {
  if (!uploads.length || uploads.length > CHAT_IMAGE_LIMIT) throw new Error(`每条消息可发送 1 到 ${CHAT_IMAGE_LIMIT} 张图片`);
  let total = 0;
  const prepared = [];
  for (const image of uploads) {
    if (image.data.length > Math.ceil(CHAT_IMAGE_BYTES / 3) * 4) throw new Error("单张图片不能超过 6 MiB，请缩小后重试");
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.toString("base64") !== image.data) throw new Error("图片数据无效，请重新添加");
    total += bytes.length;
    if (total > CHAT_IMAGE_TOTAL_BYTES) throw new Error("一条消息的图片合计不能超过 12 MiB");
    const { mimeType, width, height } = imageHeader(bytes);
    if (!width || !height || width * height > CHAT_IMAGE_PIXELS) throw new Error("图片像素过多，请裁剪或缩小后重试");
    // The worker transfers a slice, so pass an ordinary Uint8Array rather than a pooled Buffer view.
    const result = await processor.prepare(Uint8Array.from(bytes), mimeType, { maxWidth: 2000, maxHeight: 2000, maxBytes: 2 * 1024 * 1024 });
    if (!result) throw new Error("无法处理图片，请重新截图或另存为 PNG 或 JPEG 后重试");
    prepared.push({ name: image.name.trim().slice(0, 160) || "图片", ...result });
  }
  const folder = join(dataDir, "chat-images");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const images: ChatImage[] = [];
  for (const { name, mimeType, data } of prepared) {
    const bytes = Buffer.from(data, "base64");
    const id = createHash("sha256").update(bytes).digest("hex");
    const temp = join(folder, `.${randomUUID()}.tmp`);
    // Publish complete immutable bytes before the ledger commits a reference.
    try {
      await writeFile(temp, bytes, { mode: 0o600, flag: "wx", flush: true });
      await rename(temp, join(folder, id));
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
    images.push({ id, name, mimeType });
  }
  return images;
}

export async function readChatImage(dataDir: string, image: ChatImage): Promise<ImageContent> {
  if (!/^[a-f0-9]{64}$/.test(image.id)) throw new Error("图片编号无效");
  const data = await readFile(join(dataDir, "chat-images", image.id), "base64");
  return { type: "image", mimeType: image.mimeType, data };
}
