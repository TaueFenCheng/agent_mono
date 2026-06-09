"use client";

import { useEffect, useState } from "react";
import { Button } from "@intelligent-agent/ui";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { getStoredAccessToken } from "@/components/auth-storage";

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  isActive: boolean;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProviderInfo {
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  isBuiltin: boolean;
}

interface FormData {
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

const initialFormData: FormData = {
  name: "",
  provider: "deepseek",
  model: "",
  apiKey: "",
  baseUrl: ""
};

export default function ModelsPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);

  const getAuthHeaders = (): Record<string, string> => {
    const token = getStoredAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchConfigs = async () => {
    try {
      const response = await fetch("/api/model-configs", {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error("加载失败");
      const result = (await response.json()) as { data: { configs: ModelConfig[] } };
      setConfigs(result.data?.configs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载配置失败");
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await fetch("/api/providers", {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error("加载失败");
      const result = (await response.json()) as { data: { providers: ProviderInfo[] } };
      setProviders(result.data?.providers || []);
    } catch {
      // 忽略错误
    }
  };

  useEffect(() => {
    void Promise.all([fetchConfigs(), fetchProviders()]).finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (provider: string) => {
    const providerInfo = providers.find((p) => p.name === provider);
    setFormData((prev) => ({
      ...prev,
      provider,
      model: providerInfo?.defaultModel || "",
      baseUrl: providerInfo?.defaultBaseUrl || ""
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = editingId ? `/api/model-configs/${editingId}` : "/api/model-configs";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message || "保存失败");
      }

      setShowForm(false);
      setEditingId(null);
      setFormData(initialFormData);
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: ModelConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      provider: config.provider,
      model: config.model,
      apiKey: "", // 不回显 API Key
      baseUrl: config.baseUrl
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个配置吗？")) return;

    try {
      const response = await fetch(`/api/model-configs/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error("删除失败");
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/model-configs/${id}/activate`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error("激活失败");
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "激活失败");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-foreground/60">
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">模型配置</h1>
          <p className="text-sm text-foreground/60">管理 AI 模型的 API 配置，可切换不同的模型进行对话</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            添加配置
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border/60 p-4">
          <h2 className="font-medium">{editingId ? "编辑配置" : "添加新配置"}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">配置名称</label>
              <input
                type="text"
                className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                placeholder="例如：我的 DeepSeek"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <select
                className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                value={formData.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                required
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">自定义 Provider</option>
              </select>
            </div>

            {formData.provider === "custom" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">自定义 Provider 名称</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                  placeholder="例如：my-provider"
                  value={formData.provider === "custom" ? "" : formData.provider}
                  onChange={(e) => setFormData((prev) => ({ ...prev, provider: e.target.value }))}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">模型名称</label>
              <input
                type="text"
                className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                placeholder="例如：deepseek-chat"
                value={formData.model}
                onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <input
                type="password"
                className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                placeholder={editingId ? "留空表示不修改" : "输入 API Key"}
                value={formData.apiKey}
                onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                {...(editingId ? {} : { required: true })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL</label>
              <input
                type="url"
                className="w-full rounded-md border border-input/70 bg-background px-3 py-2 text-sm"
                placeholder="https://api.example.com/v1"
                value={formData.baseUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel}>
              取消
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {configs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/50 p-6 text-center text-sm text-foreground/60">
            还没有模型配置，点击上方按钮添加
          </div>
        ) : (
          configs.map((config) => (
            <div
              key={config.id}
              className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                config.isActive
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-border/60 hover:bg-foreground/5"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{config.name}</span>
                  {config.isActive && (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
                      当前使用
                    </span>
                  )}
                  {config.isCustom && (
                    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                      自定义
                    </span>
                  )}
                </div>
                <div className="text-sm text-foreground/60">
                  {config.provider} / {config.model}
                </div>
                <div className="text-xs text-foreground/40">{config.baseUrl}</div>
              </div>

              <div className="flex items-center gap-2">
                {!config.isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleActivate(config.id)}
                    className="gap-1"
                  >
                    <Check className="h-3 w-3" />
                    激活
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(config)}
                  className="gap-1"
                >
                  <Pencil className="h-3 w-3" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDelete(config.id)}
                  className="gap-1 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
