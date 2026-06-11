import type { AgentRunEvent } from "@intelligent-agent/ui";

export function parseSseBuffer(buffer: string): { events: AgentRunEvent[]; remainder: string } {
  const events: AgentRunEvent[] = [];
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice("data: ".length).trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload) as AgentRunEvent);
    } catch {
      // Skip malformed SSE payloads instead of aborting the stream.
    }
  }

  return { events, remainder };
}

export async function consumeAgentRunSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentRunEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      onEvent(event);
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseBuffer(`${buffer}\n`);
    for (const event of parsed.events) {
      onEvent(event);
    }
  }
}
