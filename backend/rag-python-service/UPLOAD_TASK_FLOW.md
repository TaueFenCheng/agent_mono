# 文件上传后自动执行 RAG 任务

本文说明当前项目里“文件上传之后，如何自动触发后续 RAG 任务”的实际链路。

## 目标

在文件上传完成后，不要求前端或人工再额外调用一次 RAG 接口。

系统自动完成这条链路：

1. 上传文件
2. 主后端异步解析文件
3. 切分出 `attachment_chunks`
4. 解析成功后自动通知独立 RAG 服务
5. RAG 服务把这些 chunk 写入 pgvector

## 实现位置

主后端触发点：
- [`/Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment.service.ts`](</Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment.service.ts>)
- [`/Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment-task-dispatcher.service.ts`](</Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment-task-dispatcher.service.ts>)

独立 RAG 服务接收点：
- [`/Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/rag.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/rag.py>)
- `POST /v1/rag/index/attachments`

## 触发时机

上传接口本身只负责：

- 保存原始文件
- 创建附件记录
- 提交 `attachment-process` 队列任务

真正的自动触发发生在附件处理任务成功之后。

也就是：

1. [`uploadAttachment()`](</Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment.service.ts>) 上传文件
2. 提交 BullMQ 任务
3. Worker 执行 [`processAttachmentJob()`](</Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment.service.ts>)
4. 文件解析成功并写入 `attachment_chunks`
5. 调用 [`AttachmentTaskDispatcherService.onAttachmentProcessed()`](</Users/tangjiaqiang/code/tangAgent/backend/agent-backend-ts/src/attachment/attachment-task-dispatcher.service.ts>)
6. 自动请求独立 RAG 服务：

```http
POST /v1/rag/index/attachments
```

请求体：

```json
{
  "attachmentIds": ["attachment-id"]
}
```

## 为什么挂在这里

因为这里是当前系统里最稳定的“后置监听点”：

- 文件已经上传完成
- 文本已经抽取完成
- chunk 已经落库
- RAG 服务这时才能安全索引

如果在上传接口刚返回时就触发：

- 文本可能还没解析完
- `attachment_chunks` 还不存在
- RAG 索引会失败

所以正确时机不是“上传成功”，而是“处理成功”。

## 失败策略

当前策略是：

- 如果通知 RAG 服务成功，记录成功日志
- 如果通知失败，只记 warning，不回滚附件处理

这意味着：

- 主附件链路优先保证成功
- RAG 自动索引属于后置增强任务
- 不会因为 RAG 服务暂时不可用，把附件处理也判定为失败

这是更合理的工程选择。

## 相关配置

主后端新增了这些环境变量：

```bash
RAG_SERVICE_URL=http://127.0.0.1:8082
RAG_AUTO_INDEX_ATTACHMENTS=true
RAG_REQUEST_TIMEOUT_MS=10000
```

含义：

- `RAG_SERVICE_URL`
  - 独立 RAG 服务地址
- `RAG_AUTO_INDEX_ATTACHMENTS`
  - 是否启用附件自动索引
- `RAG_REQUEST_TIMEOUT_MS`
  - 通知 RAG 服务的请求超时

## 总结

现在系统已经支持：

- 文件上传后异步解析
- 解析完成后自动通知 RAG 服务
- RAG 服务自动把 chunk 写入 pgvector

也就是说，当前不再需要手动再调一次：

```http
POST /v1/rag/index/attachments
```

除非你要做补偿索引或重建索引。
