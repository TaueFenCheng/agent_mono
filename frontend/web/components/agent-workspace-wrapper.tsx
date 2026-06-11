"use client";

import { AgentWorkspace, type ModelOption } from "@intelligent-agent/ui";
import { useCallback, useEffect, useState } from "react";
import { AttachmentRequestError, uploadAndProcessAttachment } from "@/lib/attachment-upload";
import { consumeAgentRunSseStream } from "@/lib/sse-parser";

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

/**
 * 客户端包装组件
 * - AgentWorkspace 需要客户端交互（onClick 等）
 * - 将客户端逻辑隔离在此，page.tsx 可保持为 Server Component
 */
export function AgentWorkspaceWrapper({ accessToken, onUnauthorized }: AgentWorkspaceWrapperProps) {
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  const authHeaders = {
    authorization: `Bearer ${accessToken}`
  };

  const prepareAttachments = useCallback<NonNullable<Parameters<typeof AgentWorkspace>[0]["onPrepareAttachments"]>>(
    async ({ sessionId, items, onStatusChange }) => {
      const results = [];
      for (const item of items) {
        onStatusChange(item.id, "uploading");
        try {
          const attachment = await uploadAndProcessAttachment(item.file, sessionId, authHeaders, {
            onUploading: () => onStatusChange(item.id, "uploading"),
            onProcessing: () => onStatusChange(item.id, "processing")
          });
          onStatusChange(item.id, "ready");
          results.push(attachment);
        } catch (error) {
          if (error instanceof AttachmentRequestError && error.status === 401) {
            onUnauthorized?.();
          }
          const message = error instanceof Error ? error.message : "附件上传失败";
          onStatusChange(item.id, "failed", message);
          throw error;
        }
      }
      return results;
    },
    [accessToken, onUnauthorized]
  );

  const assertOk = (response: Response) => {
    if (response.status === 401) {
      onUnauthorized?.();
      throw new Error("登录已失效");
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };

  // 加载模型配置列表
  useEffect(() => {
    const loadModelConfigs = async () => {
      try {
        const response = await fetch("/api/model-configs", {
          headers: authHeaders,
          cache: "no-store"
        });
        if (!response.ok) return;
        const result = (await response.json()) as { data: { configs: ModelConfig[] } };
        const configs = result.data?.configs || [];
        const options: ModelOption[] = configs.map((config) => ({
          id: config.id,
          name: config.name,
          provider: config.provider,
          model: config.model
        }));
        setModelOptions(options);

        // 选中激活的配置
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

  return (
    <AgentWorkspace
      title="intelligentAgent Web Console"
      description="左侧会话区历史记录，右侧对话沟通面板"
      modelOptions={modelOptions}
      selectedModelId={selectedModelId}
      onModelChange={setSelectedModelId}
      loadSessions={async () => {
        const response = await fetch("/api/threads", {
          headers: authHeaders,
          cache: "no-store"
        });
        assertOk(response);
        const data = (await response.json()) as { sessions: Parameters<typeof AgentWorkspace>[0]["initialSessions"] };
        return data.sessions ?? [];
      }}
      onPrepareAttachments={prepareAttachments}
      onSendStream={async ({ sessionId, message, provider, model }, { onEvent }) => {
        const response = await fetch("/api/agent-run/stream", {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ threadId: sessionId, message, provider, model })
        });

        if (response.status === 401) {
          onUnauthorized?.();
          throw new Error("登录已失效");
        }

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(errorBody?.message || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("流式响应体为空");
        }

        await consumeAgentRunSseStream(response.body, onEvent);
      }}
    />
  );
}
