import { HealthStatusPanelSSR } from "@/components/health-status-panel-ssr";
import { AgentWorkspaceWrapper } from "@/components/agent-workspace-wrapper";

/**
 * 首页 - Server Component
 * - HealthStatusPanelSSR: 服务端渲染，首屏即包含数据
 * - AgentWorkspaceWrapper: 客户端组件，处理用户交互
 */
export default function HomePage() {
  return (
    <div className="space-y-4 p-4">
      <HealthStatusPanelSSR />
      <AgentWorkspaceWrapper />
    </div>
  );
}
