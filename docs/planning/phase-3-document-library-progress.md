# Phase 3 文本文档库进度

- 更新时间：2026-07-11
- 范围：Phase 3 最小垂直切片——本地文本文档库与 `.txt/.md` 导入
- 状态：已完成并通过开发版门禁

## 本轮落地内容

- Domain：新增 `LearningDocument` 领域模型、草稿规范化、字符计数和稳定哈希输入。
- Contracts：新增文档 IPC channels、请求/响应 schema、文档错误码收敛。
- Application：新增列表、创建、详情、删除用例与稳定错误映射。
- Infrastructure：
  - Migration 2 `document_text_import`
  - SQLite `learning_documents` / `document_text_versions`
  - SHA-256 文本哈希适配器
  - 基于内容哈希的重复文档检测
- Main / Preload：
  - 显式文档 IPC handler
  - `window.deepstorming.documents` typed API
  - IPC reject 时统一回落为稳定 `AppResult`
- Renderer：
  - 文档库页默认成为主入口
  - 支持粘贴文本创建
  - 支持浏览器侧导入 `.txt/.md`
  - 支持列表、详情、删除确认
  - 失败保存保留草稿，避免丢文
  - 详情切换不再显示错位旧内容
- E2E：
  - 开发版覆盖 Provider lifecycle
  - 新增文档创建、导入、删除、重启后持久化验证
  - `test:e2e` 脚本在 Electron ABI 重建前清理损坏的 `better-sqlite3` 增量构建目录，避免原生模块构建噪音

## 已验证命令

- `pnpm vitest run apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`：7 通过
- `pnpm vitest run apps/desktop/src/preload/index.test.ts`：15 通过
- `pnpm test:e2e`：2 通过，1 跳过（packaged macOS persistence 仍需先执行 `pnpm package:dir`）

## 当前非目标

本切片刻意不包含以下能力：

- PDF 导入 / OCR / 版面解析
- 全文搜索 / chunking / embeddings
- 课堂与论文阅读对文档库的消费链路
- 教材/论文专属元数据建模深化
- 后台导入任务队列

## 下一步建议

1. 让课堂与论文阅读流程消费 `learning_documents`。
2. 如进入发布候选阶段，补跑 `pnpm package:dir` 与 packaged E2E。
3. 当需要 PDF 路线时，再从本地文本库扩展到导入作业、页面、块与派生索引。
