# DeepStorming Phase 3 文档库与文本导入设计

- 日期：2026-07-11
- 状态：已确认，待实施计划
- 范围：Phase 3 第一块最小纵向切片

## 1. 背景

Phase 2 已完成 Provider 基线：用户可以安全配置、启用并测试 AI Provider，SQLite、Migration、Secret Vault、IPC、Preload、Renderer 和 macOS 目录包持久化均已通过验收。

Phase 3 需要开始把 DeepStorming 从“Provider 管理工具”推进为“学习材料进入系统”的产品。完整 PDF 导入、OCR、版面分析、chunk、检索和课堂对话都重要，但如果第一步同时实现这些能力，风险会集中在文件解析和长任务基础设施上，用户短期仍看不到清晰闭环。

本设计选择先实现“文档库 + 手动文本导入”的最小切片：用户可以通过粘贴文本或选择 `.txt/.md` 文件创建本地 `LearningDocument`，应用持久化文档和文本内容，重启后仍能浏览、打开和删除。

## 2. 目标

1. 建立 `LearningDocument` 的第一版领域模型和 SQLite 存储。
2. 支持两种文本输入来源：粘贴文本、`.txt/.md` 文件读取。
3. 提供文档库 UI：空状态、创建入口、列表、详情、删除确认。
4. 通过显式 IPC 和 Preload API 暴露文档能力，不暴露通用 `invoke`。
5. 保持 Renderer 架构边界：不导入 Electron、Node、Application、Domain、Infrastructure 或 SQLite。
6. 形成 E2E 证明：临时 userData 下创建、导入、查看、删除和重启持久化。

## 3. 非目标

- 不导入 PDF。
- 不做 OCR、页面、布局块、坐标或图片资产。
- 不做 chunk、索引、搜索、embedding 或引用跳转。
- 不接入 active Provider，也不实现课堂对话。
- 不渲染 Markdown；`.md` 第一版按纯文本预览。
- 不实现后台导入任务队列、取消或重试；这些留给 PDF/长任务阶段。

## 4. 数据模型

新增领域概念 `LearningDocument`，而不是临时的“文本笔记”。第一版仅保存纯文本，但结构要能承接未来 PDF、OCR 和重新解析。

### 4.1 `learning_documents`

| 字段                 | 类型 | 约束     | 说明                                        |
| -------------------- | ---- | -------- | ------------------------------------------- |
| `id`                 | TEXT | PK       | 应用生成 ID                                 |
| `document_type`      | TEXT | NOT NULL | 第一版允许 `generic`，预留 `textbook/paper` |
| `title`              | TEXT | NOT NULL | 用户可见标题                                |
| `source_kind`        | TEXT | NOT NULL | `pasted_text` 或 `text_file`                |
| `original_file_name` | TEXT | NULL     | 文件导入时保存原文件名                      |
| `content_hash`       | TEXT | NOT NULL | 规范化文本的 SHA-256，用于重复检测          |
| `created_at`         | TEXT | NOT NULL | UTC ISO 字符串                              |
| `updated_at`         | TEXT | NOT NULL | UTC ISO 字符串                              |

`content_hash` 建唯一索引。第一版重复导入完全相同文本时拒绝创建并返回稳定错误。

### 4.2 `document_text_versions`

| 字段              | 类型    | 约束     | 说明                         |
| ----------------- | ------- | -------- | ---------------------------- |
| `id`              | TEXT    | PK       | 文本版本 ID                  |
| `document_id`     | TEXT    | FK       | 指向 `learning_documents.id` |
| `plain_text`      | TEXT    | NOT NULL | 原始纯文本内容               |
| `character_count` | INTEGER | NOT NULL | Unicode 字符数               |
| `created_at`      | TEXT    | NOT NULL | UTC ISO 字符串               |

第一版每个文档只有一个当前文本版本。保留 versions 表是为了以后支持 OCR 结果替换、用户修订或重新解析，而不需要推翻文档根实体。

## 5. 业务规则

### 5.1 标题和文本

- 标题 trim 后必须非空。
- 文本 trim 后必须非空。
- 标题和文本保存规范化后的值；文本保留内部换行和空白，不做 Markdown 解析。
- `character_count` 按规范化后文本的 Unicode code point 数计算。

### 5.2 来源

- `pasted_text`：用户在 UI 文本区域输入文本。
- `text_file`：用户通过浏览器文件输入选择 `.txt` 或 `.md` 文件。
- 文件导入保存 `original_file_name`，但不保存本地绝对路径。
- 第一版文件读取由 Renderer 使用浏览器 `File.text()` 完成，不经过 Main 的文件路径授权。

### 5.3 重复检测

- `content_hash = sha256(normalizedPlainText)`。
- 相同文本再次导入或粘贴创建时返回 `DOCUMENT_DUPLICATE`。
- 重复检测只基于文本内容，不基于标题或文件名。

### 5.4 删除

- 删除文档级联删除文本版本。
- 第一版没有课堂、引用、索引等下游引用，因此不需要 blocked delete。
- 删除返回空成功结果；not found 映射为稳定错误。

## 6. 分层设计

### 6.1 Domain

新增 `packages/domain/src/document.ts`：

- `DocumentType = 'generic' | 'textbook' | 'paper'`
- `DocumentSourceKind = 'pasted_text' | 'text_file'`
- `LearningDocument`
- `DocumentTextVersion`
- `DocumentDraft`
- `normalizeDocumentDraft`
- `hashDocumentTextInput`

Domain 只做值对象和规则校验，不依赖 Node crypto、SQLite、Electron 或 React。实际 SHA-256 计算放在 Application/Infrastructure 可注入 Port，Domain 只定义 hash 输入规范。

### 6.2 Application

新增用例：

- `ListDocuments`
- `CreateDocumentFromText`
- `GetDocument`
- `DeleteDocument`

新增 Ports：

- `DocumentRepositoryPort`
- `DocumentTextHasherPort`

应用层负责：

- 调用 Domain normalize。
- 计算 hash。
- 检查重复并映射为稳定错误。
- 生成文档 ID 和文本版本 ID。
- 调用 Repository 持久化。

错误码第一版：

- `DOCUMENT_VALIDATION_FAILED`
- `DOCUMENT_DUPLICATE`
- `DOCUMENT_NOT_FOUND`
- `DATABASE_UNAVAILABLE`
- `INTERNAL_ERROR`

### 6.3 Infrastructure

新增 `SqliteDocumentRepository`，使用同一个 SQLite 连接。

Migration 2 创建 `learning_documents` 和 `document_text_versions`，并启用：

- `content_hash` 唯一索引。
- `document_text_versions.document_id` 外键级联删除。
- `character_count >= 0` 检查约束。

新增 `Sha256DocumentTextHasher`，基于 Node `crypto` 实现。该实现属于 Infrastructure，Application 只依赖 Port。

### 6.4 Main / IPC / Preload / Contracts

Contracts 新增严格 schema：

- `DOCUMENT_CHANNELS.list`
- `DOCUMENT_CHANNELS.createFromText`
- `DOCUMENT_CHANNELS.get`
- `DOCUMENT_CHANNELS.remove`

DTO：

```ts
type DocumentDraftDto = {
  title: string
  plainText: string
  sourceKind: 'pasted_text' | 'text_file'
  originalFileName?: string
}
```

公开 `DocumentSummaryDto` 不包含 SQLite 内部字段或全文；详情 DTO 包含当前 `plainText`。

Preload 新增：

```ts
window.deepstorming.documents.list()
window.deepstorming.documents.createFromText(input)
window.deepstorming.documents.get(id)
window.deepstorming.documents.remove(id)
```

仍不暴露通用 IPC `invoke`。

### 6.5 Renderer

将 App 从单页 Provider 改为两页轻量导航：

- 默认页：文档库
- 次级页：Provider

文档库页面包含：

- 空状态：“还没有文档”
- 粘贴文本入口
- `.txt/.md` 文件导入入口
- 创建表单：标题、文本区域、来源提示、保存、取消
- 文档列表：标题、类型、来源、字数、创建时间、打开、删除
- 文档详情：标题、来源、字数、文本预览、删除按钮

Renderer 可以持有用户文档文本，因为它不是 secret；但不得把全文写入 console、日志、测试 snapshot 或错误对象。

## 7. 异步与错误体验

- `list/create/get/delete` 均显示 loading、success、error 状态。
- 文件读取错误在 Renderer 内显示，不进入 IPC。
- 保存期间禁用重复提交。
- 删除需要确认；删除期间禁用确认和取消按钮。
- 创建成功后回到列表并选中新文档。
- 获取详情失败时显示可恢复错误并保留列表。

## 8. 测试计划

### 8.1 Domain

- 标题空值拒绝。
- 文本空值拒绝。
- source kind 仅允许 `pasted_text/text_file`。
- hash 输入规范对前后空白稳定。

### 8.2 Contracts

- 严格拒绝未知字段。
- 拒绝空标题和空文本。
- DTO 不包含 Repository 内部字段。
- 所有设计错误码可解析。

### 8.3 Application

- 创建文档成功。
- 列表不返回全文。
- 获取详情返回全文。
- 删除后 get 返回 `DOCUMENT_NOT_FOUND`。
- 重复文本返回 `DOCUMENT_DUPLICATE`。
- Repository/数据库错误映射为稳定错误。

### 8.4 Infrastructure

- Migration 2 幂等应用。
- `content_hash` 唯一约束。
- 删除文档级联删除文本版本。
- Repository JSON/row 映射运行时校验。

### 8.5 Main / Preload

- 每个 document channel 校验有效输入和非法输入。
- IPC Handler 只调用一个 use case 并映射稳定错误。
- Preload 只暴露显式 document API。
- 无 generic `invoke`。

### 8.6 Renderer

- 空状态。
- 粘贴创建。
- 文件导入。
- 列表与详情。
- 删除确认。
- 文件读取错误。
- create/delete race 不覆盖后续状态。

### 8.7 E2E

使用临时 `DEEPSTORMING_USER_DATA_DIR`：

1. 打开文档库空状态。
2. 粘贴创建一篇文档。
3. 导入一个 `.md` 文件。
4. 打开详情确认内容。
5. 删除其中一篇文档。
6. 重启应用后确认剩余文档仍存在。

## 9. 验收标准

1. 用户可以通过粘贴文本创建文档。
2. 用户可以通过 `.txt/.md` 文件创建文档。
3. 文档列表和详情在应用重启后仍存在。
4. 重复文本会被拒绝并显示可理解错误。
5. 删除文档后详情和文本版本一并清理。
6. Renderer 不导入禁止模块。
7. `pnpm check` 通过。
8. 文档库 E2E 通过。

## 10. 后续扩展入口

- Phase 3 下一步可在本文档模型上增加段落 chunk 和词法检索。
- PDF 导入阶段可以将解析结果写入同一个 `learning_documents` 根实体，并新增 pages/blocks/chunks 表。
- 课堂阶段可以引用 `learning_documents.id`，从详情文本或 chunk 检索结果构造 active Provider 上下文。
