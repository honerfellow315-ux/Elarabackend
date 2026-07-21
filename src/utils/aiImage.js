import { env } from "../config/env.js";

const HF_ENDPOINT = (model) => `https://api-inference.huggingface.co/models/${model}`;

const ANGLE_PROMPTS = {
  front: (brand, colorDesc) =>
    `professional studio product photography, premium mineral water bottle, front label view, ${colorDesc} label design, brand text "${brand}", clean minimalist white background, soft studio lighting, sharp focus, commercial packaging shot, 4k`,
  back: (brand, colorDesc) =>
    `professional studio product photography, premium mineral water bottle, back of bottle view, ${colorDesc} label design, brand text "${brand}", clean minimalist white background, soft studio lighting, sharp focus, commercial packaging shot, 4k`,
  top: (brand, colorDesc) =>
    `professional studio product photography, premium mineral water bottle cap, top-down view, ${colorDesc} accent color, brand text "${brand}" on cap, clean minimalist white background, soft studio lighting, 4k`,
  bottom: (brand, colorDesc) =>
    `professional studio product photography, premium mineral water bottle, low angle base view, ${colorDesc} label design, brand text "${brand}", clean minimalist white background, soft studio lighting, 4k`,
};

function describeColor(gradient) {
  if (!gradient) return "elegant blue";
  if (gradient.startsWith("#")) return `a label in the color ${gradient}`;
  return "a smooth gradient label";
}

async function requestImage(prompt) {
  const res = await fetch(HF_ENDPOINT(env.HUGGINGFACE_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      inputs: prompt,
      options: { wait_for_model: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hugging Face request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:image/png;base64,${base64}`;
}

/**
 * Generates 4 AI mockup angles (front/back/top/bottom) for a bottle
 * configuration. Throws if HUGGINGFACE_API_KEY isn't configured — the
 * route layer turns that into a friendly 503.
 */
export async function generateBottleMockup({ bottleId, gradient, brand }) {
  if (!env.HUGGINGFACE_API_KEY) {
    const err = new Error("AI image generation is not configured on this server.");
    err.status = 503;
    throw err;
  }

  const safeBrand = (brand || "ELARA WAVE").slice(0, 60);
  const colorDesc = describeColor(gradient);
  const bottleDesc = bottleId ? `bottle style "${bottleId}", ` : "";

  const angles = ["front", "back", "top", "bottom"];
  const results = await Promise.all(
    angles.map(async (angle) => {
      const prompt = `${bottleDesc}${ANGLE_PROMPTS[angle](safeBrand, colorDesc)}`;
      const image = await requestImage(prompt);
      return [angle, image];
    }),
  );

  return Object.fromEntries(results);
}
