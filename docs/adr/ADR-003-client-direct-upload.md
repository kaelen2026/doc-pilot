# ADR-003：客户端直传对象存储

**状态**：Accepted

## 背景

PDF 单文件最大 50MB。若文件经 API 服务器中转上传，会占用应用服务器带宽、内存与连接时长，且不利于水平扩展。

## 决策

采用 Presigned URL 客户端直传：

```
POST /documents          → 创建 pending_upload Document + 生成 PUT Presigned URL
客户端直传对象存储        → PUT 到 URL
POST /documents/:id/complete-upload → 服务端 HEAD 校验并转 queued
```

上传 URL 有效期 10～15 分钟。所有对象存放在私有 Bucket，读取通过 API 代理或临时签名 URL。Object Key 使用结构化路径而非用户文件名。

## 后果

- 应用服务器不承载大文件流量。
- 需要"完成上传"回调来校验对象真实存在、大小、Content-Type（可选 checksum），不能只信前端。
- 需处理上传未完成的孤儿对象（见 Reconciliation）。

## 参见

- [数据模型 · 对象存储设计](../architecture/data-model.md#9-对象存储设计)
- [处理管线 · 上传 API](../architecture/pipeline.md#10-上传-api)
