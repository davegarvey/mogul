import { AgentCli, loadLlmConfig } from "./agent.js";

const [,, codeArg, nicknameArg] = process.argv;
const nickname = nicknameArg ?? `Agent-${Math.floor(Math.random() * 1000)}`;
const code = codeArg ?? process.env.MOGUL_ROOM;
const url = process.env.MOGUL_SERVER_URL ?? "ws://localhost:8137";
const maxRetries = Number(process.env.MOGUL_MAX_RETRIES ?? 3);

if (!code) {
  console.error("usage: mogul-agent <ROOM_CODE> [NICKNAME]");
  console.error("env: MOGUL_LLM_API_KEY, MOGUL_LLM_MODEL, MOGUL_LLM_BASE_URL, MOGUL_SERVER_URL, MOGUL_MAX_RETRIES");
  process.exit(1);
}

const llm = loadLlmConfig();
if (!llm.apiKey) {
  console.error("MOGUL_LLM_API_KEY is required to run the agent (set it or provide an OpenAI-compatible endpoint).");
  process.exit(1);
}

const cli = new AgentCli({ url, nickname, llm, maxRetries });

try {
  await cli.join(code);
  console.log(`[${nickname}] joined room ${code}, sitting as ${cli.result ? "seat" : "seat"}.`);
  while (!cli.result.finished) {
    await cli.playTurn();
  }
  console.log(`[${nickname}] game finished. commands=${cli.result.commands} rejections=${cli.result.rejections} malformed=${cli.result.malformed} fallbacks=${cli.result.fallbacks}`);
} catch (err) {
  console.error(`[${nickname}] error:`, err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  cli.close();
}
