import { createHmac } from "node:crypto";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { editionInputSchema } from "../../shared/edition";

const outputSchema = z.object({
  ok: z.literal(true),
  editionId: z.string(),
  articleCount: z.number().int(),
  receipt: z.string(),
});

export default defineTool({
  description:
    "Publish one complete, source-grounded Juara Merdeka sheet in Indonesian and Simplified Chinese to the Cloudflare newspaper. Set kind to hari_ini for this morning's edition or kemarin for the historical sheet; kemarin requires publicationDate (Perth assembly date) and editionDate equal to that date minus 35 years. Both language versions are required, share the same eight source articles, and are committed atomically. The operation is idempotent by sheet kind and publication date.",
  inputSchema: editionInputSchema,
  outputSchema,
  async execute(edition, context) {
    const publishUrl = process.env.CLOUDFLARE_PUBLISH_URL?.replace(/\/+$/, "");
    const secret = process.env.PUBLISH_SECRET;

    if (!publishUrl || !secret) {
      throw new Error("CLOUDFLARE_PUBLISH_URL and PUBLISH_SECRET must be configured");
    }

    const body = JSON.stringify({ ...edition, curatorModel: "gpt-5.6-sol" });
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", secret)
      .update(timestamp)
      .update(".")
      .update(body)
      .digest("base64url");

    const response = await fetch(`${publishUrl}/api/editions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-juara-timestamp": timestamp,
        "x-juara-signature": signature,
      },
      body,
      signal: context.abortSignal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : `HTTP ${response.status}`;
      throw new Error(`Edition publication failed: ${detail}`);
    }

    return outputSchema.parse(payload);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Edisi dwibahasa ${output.editionId} terbit dengan ${output.articleCount} berita dalam bahasa Indonesia dan Tionghoa. Tanda terima: ${output.receipt}.`,
    };
  },
});
