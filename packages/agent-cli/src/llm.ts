import { DEFAULT_RULES, playerById, propertyDef } from "@mogul/engine";
import type { GameRules, GameState, TalentTrackId } from "@mogul/engine";
import type { SnapshotEnvelope } from "@mogul/protocol";

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  return {
    baseUrl: env.MOGUL_LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: env.MOGUL_LLM_MODEL ?? "gpt-4o-mini",
    apiKey: env.MOGUL_LLM_API_KEY ?? "",
  };
}

export type LlmReply =
  | { ok: true; actionIndex: number; raw: string }
  | { ok: false; reason: string; raw: string };

/** Render the state snapshot + legal action menu into an LLM prompt. */
export function buildPrompt(snap: SnapshotEnvelope, rules: GameRules, seatId: string): string {
  const s = snap.state;
  const me = playerById(s, seatId);
  const menu = snap.actions
    .map((a, i) => `${i + 1}. ${a.label}`)
    .join("\n");
  const tracks = (Object.keys(s.talent) as TalentTrackId[])
    .map((t) => {
      const def = rules.talentTracks[t];
      const counts = s.talent[t].slots
        .map((n, i) => `${def.slots[i].price}:${n}`)
        .join(" ");
      return `${def.name} — ${counts}`;
    })
    .join(" | ");
  const market = s.market.current
    .map((slot) => {
      const def = propertyDef(rules, slot.propertyId);
      return `${def.name} (bid ${def.faceValue}, output ${def.output}, ${def.talentType})`;
    })
    .join(" | ");
  const mine = me.properties
    .map((o) => {
      const def = propertyDef(rules, o.propertyId);
      const have = o.contracted[def.talentType] ?? 0;
      return `${def.name}: out ${def.output}, contracted ${have}`;
    })
    .join(" | ");

  return [
    `You are "${me.name}" playing Mogul, a Power Grid-style Hollywood studio game.`,
    `Round ${s.round}, era ${s.era}, phase: ${s.phase}.`,
    `Your cash: ${me.cash}. Your theaters: ${me.theaters.length} (${me.theaters.join(", ") || "none"}).`,
    `Your properties: ${mine || "none"}.`,
    `Rights market: ${market}.`,
    `Talent market: ${tracks}.`,
    `Your legal actions this turn:`,
    menu,
    `Reply with exactly one JSON object of the form {"action": <number>} selecting one action.`,
    `Do not explain; output only the JSON.`,
  ].join("\n");
}

/**
 * Call the LLM and extract the chosen action index.
 * Returns { ok:false } with a reason when the reply is malformed (re-prompted by the caller).
 */
export async function requestAction(
  config: LlmConfig,
  prompt: string,
  actionCount: number,
): Promise<LlmReply> {
  if (!config.apiKey) return { ok: false, reason: "MOGUL_LLM_API_KEY is not set", raw: "" };
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    return { ok: false, reason: `LLM HTTP ${res.status}: ${await res.text()}`, raw: "" };
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const m = raw.match(/\{\s*"action"\s*:\s*(\d+)\s*\}/);
  if (!m) return { ok: false, reason: "no {\"action\": N} object in reply", raw };
  const idx = Number(m[1]);
  if (idx < 1 || idx > actionCount) {
    return { ok: false, reason: `action ${idx} out of range 1..${actionCount}`, raw };
  }
  return { ok: true, actionIndex: idx - 1, raw };
}

export { DEFAULT_RULES };
export type { GameState };
