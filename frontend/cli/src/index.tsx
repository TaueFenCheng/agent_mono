#!/usr/bin/env node
import React, { useState } from "react";
import { render, Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { IntelligentAgentClient } from "@intelligent-agent/sdk-ts";

interface Args {
  url: string;
  message?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { url: "http://127.0.0.1:8080" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url" && argv[i + 1]) args.url = argv[i + 1];
    if (argv[i] === "--message" && argv[i + 1]) args.message = argv[i + 1];
  }
  return args;
}

function App({ args }: { args: Args }) {
  const { exit } = useApp();
  const [input, setInput] = useState(args.message ?? "");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const runAgent = async (message: string) => {
    try {
      setLoading(true);
      setError("");
      const client = new IntelligentAgentClient({ baseUrl: args.url });
      const response = await client.runAgent({
        sessionId: `cli-${Date.now()}`,
        messages: [{ role: "user", content: message, createdAt: new Date().toISOString() }]
      });
      setOutput(response.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="cyan">intelligentAgent CLI (Ink)</Text>
      <Text dimColor>Backend: {args.url}</Text>
      <Box>
        <Text>{"> "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={(value) => {
            if (value.trim().toLowerCase() === "exit") {
              exit();
              return;
            }
            void runAgent(value);
            setInput("");
          }}
          placeholder="Type a prompt and press Enter (or type exit)"
        />
      </Box>
      {loading && <Text color="yellow">Running...</Text>}
      {output && <Text color="green">{output}</Text>}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

render(<App args={parseArgs(process.argv.slice(2))} />);
