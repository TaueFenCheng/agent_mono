import { defineConfig } from '@rspress/core';
import mermaid from 'rspress-plugin-mermaid';

// Dev/preview port is fixed to 3002 via package.json scripts (--port 3002).
// Do not use 3000 — reserved for Next.js web app.
export default defineConfig({
  root: '.',
  plugins: [
    mermaid({
      mermaidConfig: {
        theme: 'dark',
      },
    }),
  ],
  route: {
    exclude: ['rspress.config.ts', 'package.json', 'tsconfig.json', 'theme/**'],
  },
  title: 'Intelligent Agent',
  description: '自研全栈 Agent 平台 — 技术文档与面试作品集',
  lang: 'zh-CN',
  themeConfig: {
    darkMode: true,
    outline: {
      level: [2, 3],
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com',
      },
    ],
  },
});
