import OpenAI from "openai";
import { isValidSlug } from "./slug";

/**
 * Provider-agnostic AI: works with any OpenAI-compatible endpoint.
 *
 *   OpenAI:      AI_BASE_URL=https://api.openai.com/v1          AI_MODEL=gpt-4o-mini
 *   Groq:        AI_BASE_URL=https://api.groq.com/openai/v1     AI_MODEL=llama-3.3-70b-versatile
 *   OpenRouter:  AI_BASE_URL=https://openrouter.ai/api/v1       AI_MODEL=google/gemini-2.0-flash-001
 *   Ollama:      AI_BASE_URL=http://localhost:11434/v1          AI_MODEL=llama3.1
 */
const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
const model = process.env.AI_MODEL || "gpt-4o-mini";

export function isAiConfigured(): boolean {
  return apiKey.length > 0;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey, baseURL, timeout: 20000, maxRetries: 1 });
  }
  return client;
}

export type SlugContext = {
  title?: string | null;
  siteName?: string | null;
  description?: string | null;
  userDescription?: string | null;
  taken?: string[];
};

/** Ask the model for brandable slugs; returns [] on any failure so the UI can fall back to heuristics. */
export async function aiSlugs(ctx: SlugContext, limit = 8): Promise<string[]> {
  if (!isAiConfigured()) return [];
  try {
    const system = [
      "You suggest short, brandable, professional URL slugs for websites.",
      'Respond ONLY with JSON in the form {"slugs": ["...", "..."]}.',
      "Rules:",
      "- lowercase letters, numbers and single hyphens only; no leading or trailing hyphen",
      "- 3 to 40 characters; memorable and easy to say out loud",
      "- reflect the brand name and what the user says the site is about",
      "- avoid generic words like 'website', 'site' or 'url' unless they are part of the brand",
      "- never repeat or trivially vary the taken slugs (no appending random numbers)",
    ].join("\n");

    const user = JSON.stringify({
      site_title: ctx.title ?? null,
      site_name: ctx.siteName ?? null,
      site_description: ctx.description ?? null,
      user_description: ctx.userDescription ?? null,
      taken_slugs: ctx.taken ?? [],
      how_many: limit,
    });

    const res = await getClient().chat.completions.create({
      model,
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = res.choices[0]?.message?.content ?? "";
    return parseSlugs(text).slice(0, limit);
  } catch (err) {
    console.error("[ai] slug generation failed:", err);
    return [];
  }
}

function parseSlugs(text: string): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const slug = value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
    if (isValidSlug(slug) && !out.includes(slug)) out.push(slug);
  };

  try {
    const obj = JSON.parse(text) as { slugs?: unknown };
    if (Array.isArray(obj.slugs)) obj.slugs.forEach(add);
  } catch {
    // Tolerant fallback: grab the first [...] block anywhere in the response.
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        (JSON.parse(match[0]) as unknown[]).forEach(add);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}
