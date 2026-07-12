# PDF Document Foundation Design

- Date: 2026-07-12
- Scope: next document foundation slice after the text-only library
- Status: design ready for implementation planning

## 1. Problem

DeepStorming 的产品目标以 PDF 教材和论文为主要知识来源，但当前实现只支持粘贴文本和 `.txt/.md` 导入。下一阶段需要让 PDF 进入同一个本地优先文档模型，同时保留现有架构边界和课堂证据链。

本设计只做 PDF 文档底座：导入任务、托管文件、页、文本块和稳定失败状态。它不实现 OCR、embedding、复杂阅读器或论文结构识别。

## 2. Goals

1. 用户可以选择文本型 PDF 并创建可见导入任务。
2. 应用复制 PDF 到 `userData` 管理目录，不长期依赖原始路径授权。
3. 应用保存页级文本和文本块，后续可从 page/block 启动课堂和跳回证据。
4. 扫描 PDF、密码保护 PDF、损坏 PDF 和解析失败都进入稳定失败状态。
5. 导入任务支持 loading、success、error；取消语义在本阶段只设计，不作为第一刀实现。
6. 不把 PDF 原始路径、完整正文、API Key 或外部 Provider 请求写入 Renderer state、日志或 snapshots。

## 3. Non-goals

- OCR。
- 图像、公式、表格结构理解。
- Embedding。
- FTS5/BM25。
- 完整 PDF 阅读器。
- 云端上传 PDF。
- 后台多任务队列。

## 4. Architecture

### Domain

新增 PDF 相关值对象：

- `DocumentImportJob`
- `ManagedDocumentFile`
- `DocumentPage`
- `DocumentTextBlock`
- `DocumentAnchorTarget`

Domain 只表达规则，不导入 PDF.js、Electron、fs 或 SQLite。

### Application

新增 use cases：

- `ImportPdfDocument`
- `GetDocumentPages`
- `GetDocumentPageBlocks`

新增 ports：

- `ManagedFileStorePort`
- `PdfTextExtractorPort`
- `DocumentImportJobRepositoryPort`

Application 负责状态机和安全错误映射：

```text
queued -> copying -> parsing -> ready
                    -> failed
```

### Infrastructure

实现：

- SQLite migrations for jobs/files/pages/blocks。
- Managed file copy into `userData/documents/{documentId}/source.pdf`。
- PDF text extractor adapter。

第一刀可以使用 `pdfjs-dist` 或一个窄适配器包；选择前必须验证 Electron build、Vitest 和 packaged app。

### Main / Preload

新增显式 IPC：

- `documents:import-pdf`
- `documents:get-pages`
- `documents:get-page-blocks`

Preload 暴露：

```ts
window.deepstorming.documents.importPdf(input)
window.deepstorming.documents.getPages(documentId)
window.deepstorming.documents.getPageBlocks(documentId, pageNumber)
```

Renderer 不接触 Node file path beyond user-selected safe input；Main 负责复制和解析。

### Renderer

文档库新增 PDF 导入入口：

- 选择 PDF。
- 显示导入状态。
- 成功后进入文档详情。
- 失败时显示稳定原因和可重试入口。

## 5. Data Model

### `document_import_jobs`

| Field           | Type | Notes                                                   |
| --------------- | ---- | ------------------------------------------------------- |
| id              | TEXT | PK                                                      |
| document_id     | TEXT | FK `learning_documents(id)` nullable until document row |
| source_kind     | TEXT | `pdf_file`                                              |
| status          | TEXT | `queued/copying/parsing/ready/failed/cancelled`         |
| original_name   | TEXT | User-visible file name                                  |
| file_size_bytes | INT  | Non-negative                                            |
| content_hash    | TEXT | SHA-256                                                 |
| error_code      | TEXT | Stable error code                                       |
| error_message   | TEXT | Safe user message                                       |
| created_at      | TEXT | UTC ISO                                                 |
| updated_at      | TEXT | UTC ISO                                                 |
| finished_at     | TEXT | Nullable                                                |

### `document_files`

| Field           | Type | Notes                                   |
| --------------- | ---- | --------------------------------------- |
| id              | TEXT | PK                                      |
| document_id     | TEXT | FK                                      |
| kind            | TEXT | `source_pdf`                            |
| storage_relpath | TEXT | Relative path under app-managed storage |
| sha256          | TEXT | Hash                                    |
| byte_size       | INT  | Non-negative                            |
| created_at      | TEXT | UTC ISO                                 |

### `document_pages`

| Field       | Type | Notes          |
| ----------- | ---- | -------------- |
| id          | TEXT | PK             |
| document_id | TEXT | FK             |
| page_number | INT  | 1-based        |
| width       | REAL | PDF points     |
| height      | REAL | PDF points     |
| text        | TEXT | Extracted text |
| text_hash   | TEXT | SHA-256        |
| created_at  | TEXT | UTC ISO        |

### `document_text_blocks`

| Field       | Type | Notes                         |
| ----------- | ---- | ----------------------------- |
| id          | TEXT | PK                            |
| document_id | TEXT | FK                            |
| page_id     | TEXT | FK                            |
| block_index | INT  | Page-local ordering           |
| text        | TEXT | Extracted text                |
| x           | REAL | Nullable if extractor missing |
| y           | REAL | Nullable                      |
| width       | REAL | Nullable                      |
| height      | REAL | Nullable                      |
| created_at  | TEXT | UTC ISO                       |

## 6. Error Codes

Add document-level stable errors:

- `DOCUMENT_IMPORT_FAILED`
- `DOCUMENT_FILE_UNSUPPORTED`
- `DOCUMENT_FILE_TOO_LARGE`
- `DOCUMENT_PDF_PASSWORD_PROTECTED`
- `DOCUMENT_PDF_TEXT_MISSING`
- `DOCUMENT_PDF_PARSE_FAILED`

All error messages must be safe for UI and docs. Caught extractor errors must not leak local paths or raw parser stack traces.

## 7. Classroom Anchor Extension

Current anchors use text offsets. PDF foundation adds optional target metadata:

```ts
type LessonAnchorTarget =
  | { kind: 'text_offset'; startOffset: number; endOffset: number }
  | {
      kind: 'pdf_block'
      pageNumber: number
      blockId: string
      blockRange?: { start: number; end: number }
    }
```

First implementation can keep existing `lesson_source_anchors` table unchanged and store PDF-origin snippet as today. A later migration should add `target_json` so old text anchors and new PDF block anchors share one representation.

## 8. Testing Strategy

- Domain tests for import state transitions and anchor target validation.
- Contract tests for strict schemas and stable error envelopes.
- Migration tests for new tables and rollback behavior.
- Repository tests for job/page/block persistence and duplicate hash behavior.
- Application tests for success, password/scanned/damaged failures, safe messages, and no full PDF text in public summary DTOs.
- Main/Preload tests for explicit IPC.
- Renderer tests for loading/success/error states.
- E2E with small text PDF and scanned/no-text PDF fixture.

## 9. Open Questions Resolved for First Slice

- OCR is not included; scanned PDFs fail with `DOCUMENT_PDF_TEXT_MISSING`.
- A full PDF viewer is not included; document detail can show page/block text preview.
- Import cancellation is not included; job state reserves `cancelled` for the next slice.
- Embeddings and chunking are not included; page/block facts are enough to unlock future chunking.
