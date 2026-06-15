# 附件解析与 RAG 集成问题总结

## 当前状态

### 已完成的修复

1. **tesseract.js ESM/CJS 兼容问题** ✅
   - 文件：`backend/agent-backend-ts/src/attachment/attachment.parser.ts`
   - 问题：`await import("tesseract.js")` 返回的模块对象需要访问 `.default`
   - 修复：添加 `const tesseract = mod.default ?? mod;`

2. **错误信息优化** ✅
   - 文件：`backend/agent-backend-ts/src/attachment/attachment.service.ts`
   - 改进：在错误信息中显示具体的 OCR 失败原因

3. **OCR 调试日志** ✅
   - 文件：`backend/agent-backend-ts/src/attachment/attachment.parser.ts`
   - 添加：详细的 OCR 处理日志（buffer 大小、模块加载、识别结果）

4. **临时禁用 RAG 检索** ✅
   - 文件：`backend/agent-backend-ts/src/agent/rag-retrieval.service.ts`
   - 原因：OCR 乱码导致 Agent 进入无限循环（GraphRecursionError）
   - 状态：已临时禁用，等待 OCR 和 Embedding 服务完善后重新启用

---

## 待解决的问题

### 1. OCR 质量问题

**现状**：
- tesseract.js 中文识别质量差，输出大量乱码
- 示例输出：`9:41 wil 全 - mz < 章 欣 怡 on © ~ 了`

**推荐方案**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 百度 OCR API | 中文识别准确率高，有免费额度 | 需要网络请求 |
| 阿里云 OCR | 企业级稳定性 | 需要付费 |
| PaddleOCR（Python） | 开源免费，本地部署 | 需要额外服务 |
| 多模态 VLM | 直接理解图片，无需传统 OCR | 成本较高 |

**实现建议**：
```typescript
// 新增：使用外部 OCR API
async function parseImageByExternalOCR(buffer: Buffer): Promise<ParsedAttachment> {
  const base64 = buffer.toString('base64');

  // 方案 A: 百度 OCR
  const token = await getBaiduAccessToken();
  const result = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `image=${encodeURIComponent(base64)}`
  });

  // 方案 B: 多模态 VLM
  const result = await visionModel.invoke({
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
        { type: "text", text: "请提取这张图片中的所有文字内容" }
      ]
    }]
  });

  return { parser: "external-ocr", text: result.text, metadata: {} };
}
```

### 2. RAG Embedding 服务未配置

**现状**：
- RAG 服务使用 LlamaIndex 的 `OpenAIEmbedding`
- 需要 OpenAI 兼容的 embedding API
- 当前未配置，导致 embedding 调用返回 404

**推荐方案**：

| 服务 | 模型 | Base URL | 备注 |
|------|------|----------|------|
| 硅基流动 | BAAI/bge-large-zh-v1.5 | https://api.siliconflow.cn/v1 | 国内可用，有免费额度 |
| 智谱 AI | embedding-3 | https://open.bigmodel.cn/api/paas/v4 | 国内可用 |
| OpenAI | text-embedding-3-small | https://api.openai.com/v1 | 需要科学上网 |

**配置方法**：

在 `infra/.env.docker` 中添加：
```bash
# 使用硅基流动
RAG_OPENAI_API_KEY=你的SiliconFlow_API_Key
RAG_OPENAI_BASE_URL=https://api.siliconflow.cn/v1
RAG_EMBED_MODEL=BAAI/bge-large-zh-v1.5
```

然后重启 RAG 服务：
```bash
cd infra && docker compose restart rag
```

### 3. Agent 无限循环问题

**现状**：
- 当 OCR 乱码内容作为 `systemContext` 传给 Agent 时
- Agent 无法理解内容，反复尝试调用工具
- 触发 `GraphRecursionError: Recursion limit of 25 reached`

**根因**：
- OCR 识别的文本质量差，包含大量无意义字符
- Agent 尝试从乱码中提取信息但失败
- Agent 继续尝试，进入循环

**解决方案**：
1. 短期：已禁用 RAG 检索（当前状态）
2. 长期：改进 OCR 质量后，添加内容质量检查

**内容质量检查示例**：
```typescript
function isValidTextContent(text: string): boolean {
  // 检查是否有足够的可读字符
  const readableChars = text.match(/[一-龥a-zA-Z0-9]/g)?.length ?? 0;
  const totalChars = text.length;
  const readableRatio = readableChars / totalChars;

  // 至少 30% 是可读字符
  return readableRatio > 0.3 && readableChars > 10;
}

// 在 retrieveParsedChunks 中使用
for (const chunk of attachment.chunks) {
  if (!isValidTextContent(chunk.content)) {
    continue; // 跳过质量差的内容
  }
  // ... 添加到 blocks
}
```

---

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `backend/agent-backend-ts/src/attachment/attachment.parser.ts` | 修改 | 修复 tesseract.js ESM 导入，添加调试日志 |
| `backend/agent-backend-ts/src/attachment/attachment.service.ts` | 修改 | 改进错误信息显示 |
| `backend/agent-backend-ts/src/agent/rag-retrieval.service.ts` | 修改 | 临时禁用 RAG 检索 |

---

## 测试验证

### 1. 测试 OCR 解析
```bash
# 上传图片后查看后端日志
docker logs intelligent-agent-api --tail 50 | grep OCR
```

预期输出：
```
[OCR] Starting OCR parse, buffer size: 141338 bytes, lang: eng+chi_sim
[OCR] tesseract.js module loaded
[OCR] Calling recognize...
[OCR] Success, extracted XXX chars
```

### 2. 测试 RAG 搜索
```bash
curl -s -X POST http://localhost:8082/v1/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "测试", "threadId": "web-xxx", "topK": 3}' | jq '.'
```

预期输出（配置 embedding 后）：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "hits": [...]
  }
}
```

### 3. 测试 Agent 聊天
```bash
# 在前端界面中上传图片并提问
# 确认 Agent 不再进入无限循环
```

---

## 后续计划

### Phase 1：短期修复（已完成）
- [x] 修复 tesseract.js ESM 导入问题
- [x] 添加 OCR 调试日志
- [x] 临时禁用 RAG 检索避免 Agent 循环

### Phase 2：OCR 质量改进
- [ ] 集成外部 OCR API（百度/阿里）
- [ ] 或实现多模态 VLM 图片理解
- [ ] 添加内容质量检查逻辑

### Phase 3：RAG 服务完善
- [ ] 配置 embedding 服务（硅基流动/智谱）
- [ ] 重新启用 RAG 检索
- [ ] 测试语义搜索效果

### Phase 4：生产就绪
- [ ] 添加 OCR 服务降级逻辑（主服务失败时回退到 tesseract.js）
- [ ] 实现附件内容缓存（避免重复 OCR）
- [ ] 添加用户反馈机制（报告 OCR 识别错误）

---

## 相关文档

- [RAG Python 服务文档](../backend/rag-python-service/README.md)
- [附件上传流程](../backend/agent-backend-ts/src/attachment/README.md)
- [Agent 核心文档](../core/agent-core-ts/README.md)
