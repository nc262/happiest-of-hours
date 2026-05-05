/**
 * Minimal keyword-based RAG (Retrieval-Augmented Generation) knowledge base.
 *
 * Each entry represents a curated fact about happy hour patterns for a
 * particular city / venue-type / drink preference.  Before calling the AI
 * model the relevant chunks are retrieved by keyword overlap and prepended to
 * the system prompt, grounding the model in real-world patterns.
 *
 * In production this would be replaced with a proper vector store
 * (e.g. Pinecone, pgvector, Chroma) and dense embeddings.
 */

export interface KnowledgeChunk {
  id: string;
  tags: string[];   // keywords used for retrieval
  content: string;  // text injected into the prompt
}

const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: "hh-timing-weekday",
    tags: ["happy hour", "timing", "weekday", "general"],
    content:
      "Most US bars hold happy hour Mon–Fri between 3 pm and 7 pm. Some extend to 8 pm on slower weekdays (Mon/Tue). Weekend happy hours are less common but do exist, often 12 pm–4 pm on Saturdays.",
  },
  {
    id: "hh-beer-deals",
    tags: ["beer", "draft", "domestic", "deals"],
    content:
      "Typical happy-hour beer deals: domestic drafts $2–4, craft drafts $4–6, pitchers $8–14. Bars near universities often go lower ($1–2 domestics). Upscale gastropubs rarely discount below 20%.",
  },
  {
    id: "hh-cocktail-deals",
    tags: ["cocktails", "well drinks", "spirits", "deals"],
    content:
      "Typical happy-hour cocktail deals: well drinks $4–6, signature cocktails $7–9 (from $12–15 regular). Craft cocktail bars discount less aggressively—expect $2–3 off rather than 50% off.",
  },
  {
    id: "hh-wine-deals",
    tags: ["wine", "house wine", "deals"],
    content:
      "House wine by the glass during happy hour: $4–7 (from $9–12 regular). Wine bars may offer a curated 'HH flight' at $10–14. Sparkling / rosé promotions are popular in warmer months.",
  },
  {
    id: "hh-austin",
    tags: ["austin", "texas", "6th street", "rainey street"],
    content:
      "Austin, TX happy hour hubs: 6th Street (college-oriented, cheap domestics), Rainey Street (craft cocktails, lively patios), South Congress (casual wine bars), East Austin (hip craft beer bars). Happy hours typically 3–7 pm weekdays.",
  },
  {
    id: "hh-nyc",
    tags: ["new york", "nyc", "manhattan", "brooklyn"],
    content:
      "NYC happy hours are often 4–7 pm; some neighborhoods (LES, Williamsburg) run until 8 pm. Expect $6–8 rail drinks, $5–7 house wine, $5–6 draft beer. Rooftop bars in Midtown discount 20–30% rather than deep cuts.",
  },
  {
    id: "hh-chicago",
    tags: ["chicago", "wicker park", "river north", "wrigleyville"],
    content:
      "Chicago HH patterns: River North upscale bars, 4–7 pm, $5–7 cocktails; Wicker Park dive bars all-day specials; Wrigleyville sports bars $2 domestics game days.",
  },
  {
    id: "hh-sports-bar",
    tags: ["sports bar", "game day", "beer"],
    content:
      "Sports bars often have extended happy hours on game days plus drink specials tied to scores (e.g., $1 off every time the home team scores). They prioritize beer (draft domestics & craft) and simple cocktails.",
  },
  {
    id: "hh-rooftop",
    tags: ["rooftop", "outdoor", "view"],
    content:
      "Rooftop bars typically charge a premium (10–20% above street-level); happy hour discounts are shallower ($2 off cocktails rather than half-price). Peak hours 5–8 pm in summer.",
  },
  {
    id: "hh-wine-bar",
    tags: ["wine bar", "wine", "quiet", "relaxed"],
    content:
      "Wine bars tend to have 'wine o'clock' specials (select bottles 25–30% off) from 4–6 pm weekdays. Atmosphere is quieter; cheese/charcuterie pairings often included in HH packages.",
  },
];

/**
 * Retrieves the top N most relevant chunks for a given query using
 * simple term-frequency overlap scoring.
 */
export function retrieveChunks(query: string, topN = 4): KnowledgeChunk[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const score = chunk.tags.reduce((acc, tag) => {
      return acc + (terms.some((t) => tag.includes(t) || t.includes(tag)) ? 1 : 0);
    }, 0);
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.chunk);
}

/** Formats retrieved chunks as a context block to inject into a prompt. */
export function buildRagContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return "";
  return (
    "KNOWLEDGE BASE CONTEXT (use as background, prioritize real venue data):\n" +
    chunks.map((c) => `- ${c.content}`).join("\n")
  );
}
