"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import type { UIMessage } from "ai";
import { AgentWorkspace, type ModelOption } from "@intelligent-agent/ui";
import { useEffect, useState } from "react";

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  isActive: boolean;
}

interface AgentWorkspaceWrapperProps {
  accessToken: string;
  onUnauthorized?: () => void;
}

/** 从 UIMessage.parts 提取纯文本内容 */
function extractTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * 客户端包装组件
 * 使用 Vercel AI SDK v6 useChat hook 管理对话状态
 */
export function AgentWorkspaceWrapper({ accessToken, onUnauthorized }: AgentWorkspaceWrapperProps) {
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [threadId] = useState<string>(() => `web-${Date.now()}`);

  const selectedModel = modelOptions.find((m) => m.id === selectedModelId);

  const authHeaders = {
    authorization: `Bearer ${accessToken}`,
  };

  // useChat hook (v6) — 管理对话状态和流式响应
  const {
    messages: aiMessages,
    sendMessage,
    status,
    error,
    setMessages,
    clearError,
  } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/chat",
      headers: authHeaders,
      body: {
        threadId,
        provider: selectedModel?.provider,
        model: selectedModel?.model,
      },
    }),
    onError: (err) => {
      if (err.message.includes("401")) {
        onUnauthorized?.();
      }
    },
  });

  // 加载模型配置列表
  useEffect(() => {
    const loadModelConfigs = async () => {
      try {
        const response = await fetch("/api/model-configs", {
          headers: authHeaders,
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as { data: { configs: ModelConfig[] } };
        const configs = result.data?.configs || [];
        const options: ModelOption[] = configs.map((config) => ({
          id: config.id,
          name: config.name,
          provider: config.provider,
          model: config.model,
        }));
        setModelOptions(options);

        const activeConfig = configs.find((c) => c.isActive);
        if (activeConfig) {
          setSelectedModelId(activeConfig.id);
        } else if (options.length > 0) {
          setSelectedModelId(options[0].id);
        }
      } catch {
        // 忽略加载错误
      }
    };
    void loadModelConfigs();
  }, [accessToken]);

  // 将 UIMessage 转换为 AgentWorkspaceMessage
  const agentMessages = aiMessages
    .filter((m: UIMessage) => m.role === "user" || m.role === "assistant")
    .map((m: UIMessage) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: extractTextContent(m),
      createdAt: new Date().toISOString(),
    }));

  const isLoading = status === "submitted" || status === "streaming";

  // 处理发送
  const handleSend = async (input: string) => {
    clearError();
    setInputValue("");
    await sendMessage({ text: input });
  };

  return (
    <AgentWorkspace
      title="IntelligentAgent Web Agent"
      description="Vercel AI SDK 驱动的对话面板"
      modelOptions={modelOptions}
      selectedModelId={selectedModelId}
      onModelChange={setSelectedModelId}
      externalMessages={agentMessages}
      externalInput={inputValue}
      externalLoading={isLoading}
      externalError={error?.message ?? ""}
      onExternalInputChange={setInputValue}
      onExternalSend={handleSend}
      onExternalClear={() => setMessages([])}
    />
  );
}
