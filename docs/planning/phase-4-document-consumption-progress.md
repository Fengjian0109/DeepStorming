# Phase 4 文档消费基础进度

- 更新时间：2026-07-11
- 范围：让后续课堂与论文阅读流程可以消费 `learning_documents`
- 状态：最小搜索与来源锚点切片已完成

## 本轮落地内容

- Application：新增 `SearchDocuments` 用例，校验空 query，返回稳定错误码。
- Repository Port：`DocumentRepositoryPort.search(query)` 返回最新版正文匹配结果。
- Infrastructure：`SqliteDocumentRepository.search` 在 `document_text_versions` 最新版本上做大小写不敏感匹配，限制前 50 条结果。
- Contracts：新增 `documents:search` IPC channel、搜索请求 schema、`DocumentSearchResultDto` 与结果 schema。
- Main / Preload：显式注册搜索 IPC，并暴露 `window.deepstorming.documents.search(query)`。
- Renderer：文档库加入正文搜索框、搜索 loading/error/empty/result 状态，搜索结果只显示 snippet、字符 offset 与打开按钮。
- E2E：文档创建/导入/重启持久化流程中加入正文搜索和搜索结果打开验证。

## 数据面约束

- 搜索结果不返回全文 `plainText`。
- 搜索结果不返回 SQLite 内部字段或 `contentHash`。
- 搜索结果包含：
  - `documentId`
  - 文档摘要字段
  - `snippet`
  - `startOffset`
  - `endOffset`

这些字段可作为后续 `SourceAnchor` / chunk / 课堂引用的最小输入。

## 当时非目标

- FTS5 / BM25 排序（已在后续 D4 以 `document_chunks_fts` 派生索引补齐）。
- chunking（已在后续 D4 补齐）与 embeddings（仍未实现）。
- PDF 页码、坐标和高亮。
- AI 课堂状态机。
- 论文阅读专属工作区。

## 已验证命令

- `pnpm vitest run packages/application/src/document-use-cases.test.ts apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`：29 通过。
- `pnpm test:e2e`：2 通过，1 跳过。
- `pnpm check`：Prettier、typecheck、31 个测试文件 / 382 个测试、桌面端构建全部通过。

## 下一步建议

1. 把搜索结果升级为 `SourceAnchor` 领域模型，并在详情页支持根据 offset 定位或高亮。
2. 为课堂建立最小 `LessonSession`：从一个文档搜索结果或文档详情启动，保存学习会话和首轮上下文。
3. 状态更新：D4 已为课堂上下文新增独立 chunk/FTS 检索层；文档库搜索仍保留 Phase 4 的稳定 contract 与 SQLite LIKE 实现。
