# DeepStorming 数据库设计说明书

- 文档版本：v0.1
- 数据库：SQLite
- 对应架构：`architecture.md` v0.1
- 说明：本文定义逻辑 Schema、约束与迁移策略；实际 DDL 按开发阶段拆分为顺序迁移文件。

## 1. 设计原则

1. 使用通用 `documents` 表承载教材和论文身份，不建立以 `books` 为中心的底层。
2. 原始事实、用户学习事件和可重建派生数据分离。
3. API Key 永不以明文写入数据库。
4. 掌握度是多条证据的聚合结果，不能覆盖或删除历史证据。
5. 模型生成的课程结构、论文观点和评价必须保留来源与生成版本。
6. 所有跨表关系启用外键，删除行为显式定义。
7. 所有时间保存为 UTC ISO 8601 字符串；显示时再转换为本地时区。
8. 主键统一使用应用生成的 `TEXT` ID；实现阶段优先采用可排序 UUID。
9. 全文索引和 Embedding 属于派生数据，应能从页、块和 Chunk 重建。
10. 表结构只能通过 Migration 变更。

## 2. SQLite 基线

每个连接初始化：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

建议通用字段：

```text
id          TEXT PRIMARY KEY
created_at  TEXT NOT NULL
updated_at  TEXT NOT NULL
```

只有确实需要恢复或审计的聚合根使用 `deleted_at`；内部派生行优先硬删除并通过外键级联。

## 3. 关系总览

```mermaid
erDiagram
    DOCUMENTS ||--o{ DOCUMENT_PAGES : contains
    DOCUMENT_PAGES ||--o{ DOCUMENT_BLOCKS : contains
    DOCUMENTS ||--o{ DOCUMENT_CHUNKS : indexed_as
    DOCUMENTS ||--o| TEXTBOOK_PROFILES : may_be
    DOCUMENTS ||--o| PAPER_PROFILES : may_be
    LESSON_SESSIONS ||--o{ LESSON_STEPS : contains
    LESSON_STEPS ||--o{ MESSAGES : contains
    MESSAGES ||--o{ MESSAGE_CITATIONS : cites
    DOCUMENT_CHUNKS ||--o{ MESSAGE_CITATIONS : supports
    LESSON_SESSIONS ||--o{ MASTERY_EVIDENCE : produces
    REVIEW_ITEMS ||--o{ REVIEW_EVENTS : records
```

## 4. 系统与设置

### 4.1 `schema_migrations`

| 字段       | 类型    | 约束     | 说明         |
| ---------- | ------- | -------- | ------------ |
| version    | INTEGER | PK       | 单调递增版本 |
| name       | TEXT    | NOT NULL | 迁移名       |
| checksum   | TEXT    | NOT NULL | 文件校验值   |
| applied_at | TEXT    | NOT NULL | 执行时间     |

约束：已执行迁移不得静默修改；Checksum 不一致时启动失败并给出诊断。

### 4.2 `app_settings`

| 字段       | 类型 | 约束     | 说明     |
| ---------- | ---- | -------- | -------- |
| key        | TEXT | PK       | 设置键   |
| value_json | TEXT | NOT NULL | JSON 值  |
| updated_at | TEXT | NOT NULL | 更新时间 |

不得存放 API Key、Token 或完整敏感请求。

### 4.3 `ai_providers`

| 字段              | 类型    | 约束               | 说明                                  |
| ----------------- | ------- | ------------------ | ------------------------------------- |
| id                | TEXT    | PK                 | Provider ID                           |
| provider_type     | TEXT    | NOT NULL           | `mock/deepseek/openai_compatible/...` |
| display_name      | TEXT    | NOT NULL           | 用户可见名称                          |
| base_url          | TEXT    | NULL               | 自定义接口地址                        |
| model_name        | TEXT    | NOT NULL           | 模型名称                              |
| secret_ref        | TEXT    | NULL               | 安全存储引用，不是明文 Key            |
| capabilities_json | TEXT    | NOT NULL           | 流式、结构化、视觉等能力              |
| is_active         | INTEGER | NOT NULL DEFAULT 0 | 是否当前使用                          |
| last_test_status  | TEXT    | NULL               | 最近连接测试结果                      |
| last_tested_at    | TEXT    | NULL               | 最近测试时间                          |
| created_at        | TEXT    | NOT NULL           | 创建时间                              |
| updated_at        | TEXT    | NOT NULL           | 更新时间                              |
| revision          | INTEGER | NOT NULL DEFAULT 1 | 内部单调版本；不进入公共 Provider DTO |

索引与约束：

- `provider_type` 检查约束。
- 任意时刻最多一个 `is_active = 1`，通过部分唯一索引实现。
- 删除 Provider 前检查是否仍被运行中的课堂引用。
- `revision >= 1`；创建时为 `1`。更新和启用事务比较期望 revision，成功时原子递增。

### 4.4 `provider_write_requests`

| 字段                   | 类型 | 约束     | 说明                                                                              |
| ---------------------- | ---- | -------- | --------------------------------------------------------------------------------- |
| request_id             | TEXT | PK       | IPC request ID；完成结果不可变                                                    |
| operation              | TEXT | NOT NULL | `create/update/delete/activate`                                                   |
| target_provider_id     | TEXT | NOT NULL | 目标 Provider ID；与 operation 共同绑定重放身份                                   |
| outcome_status         | TEXT | NOT NULL | `succeeded/removed/blocked/not_found`                                             |
| provider_snapshot_json | TEXT | NULL     | Provider 或删除结果快照；含内部 `revision`，可含 `secret_ref`，不得含原始 API Key |
| created_at             | TEXT | NOT NULL | 结果与业务写入在同一事务中提交                                                    |

约束：同一 `request_id` 的重放仅在 `operation` 和非空 `target_provider_id` 都匹配时返回原始逻辑结果且不再次应用业务写入；否则拒绝。快照可因 blocked/not-found 等结果为空，但目标身份不得依赖快照。Provider 创建、更新、启用和原子删除必须与对应结果行在同一事务内提交。更新和启用使用调用方首次读取的内部 `revision` 作为事务内乐观并发条件，成功时递增；`updated_at` 仅用于展示和审计。启用还必须在事务内验证目标仍为 Mock 或具有 `secret_ref`。

连接测试状态不进入本表。Repository 使用独立 `provider_test_operations` 表按 `operation_id` 持久化同一次状态转换，并以期望状态执行比较并交换，只允许将 `testing` 转换为终态；转换结果为 `applied/replayed/stale/not_found`。该持久化结构在 Task 6 建立，Task 8 在其上实现连接测试编排与取消。

### 4.5 `provider_test_operations`

| 字段                   | 类型 | 约束     | 说明                                     |
| ---------------------- | ---- | -------- | ---------------------------------------- |
| operation_id           | TEXT | PK       | 单次连接测试操作 ID                      |
| provider_id            | TEXT | NOT NULL | Provider 逻辑引用                        |
| current_status         | TEXT | NOT NULL | `testing/success/error/cancelled`        |
| provider_snapshot_json | TEXT | NOT NULL | 该次成功转换产生的严格校验 Provider 快照 |
| created_at             | TEXT | NOT NULL | 首次进入 `testing` 的时间                |
| updated_at             | TEXT | NOT NULL | 最近一次成功状态转换时间                 |

`operation_id` 与 `provider_id` 绑定。首次转换只能进入 `testing`；终态转换必须比较当前 `testing` 状态，并与 Provider 状态、结果快照及 revision 增量在同一事务提交。操作历史不随 Provider 删除而删除；重复相同状态返回持久化的原始快照且不增加 revision，即使 Provider 后续已被编辑或删除。

## 5. 文档与导入

### 5.0 已实现的最小文本文档库（Migration 2）

当前仓库在 Migration 2 (`document_text_import`) 里已经落地的是 Phase 3 最小切片，而不是本节后续更完整的 PDF/结构化导入蓝图。已实现表如下。

### 5.0.1 `learning_documents`

| 字段               | 类型 | 约束     | 说明                             |
| ------------------ | ---- | -------- | -------------------------------- |
| id                 | TEXT | PK       | 文档 ID                          |
| document_type      | TEXT | NOT NULL | `generic/textbook/paper`         |
| title              | TEXT | NOT NULL | 文档标题                         |
| source_kind        | TEXT | NOT NULL | `pasted_text/text_file`          |
| original_file_name | TEXT | NULL     | 导入文件名；粘贴文本时为空       |
| content_hash       | TEXT | NOT NULL | 规范化正文 SHA-256，用于重复检测 |
| created_at         | TEXT | NOT NULL | 创建时间                         |
| updated_at         | TEXT | NOT NULL | 最近更新时间                     |

索引与约束：

- `UNIQUE(content_hash)`：当前最小切片按正文内容去重。
- `document_type`、`source_kind` 通过 `CHECK` 约束限制枚举值。

### 5.0.2 `document_text_versions`

| 字段            | 类型    | 约束                                          | 说明                 |
| --------------- | ------- | --------------------------------------------- | -------------------- |
| id              | TEXT    | PK                                            | 文本版本 ID          |
| document_id     | TEXT    | FK `learning_documents(id)` ON DELETE CASCADE | 所属文档             |
| plain_text      | TEXT    | NOT NULL                                      | 当前存储的规范化正文 |
| character_count | INTEGER | NOT NULL, `CHECK (character_count >= 0)`      | 字符数               |
| created_at      | TEXT    | NOT NULL                                      | 该文本版本创建时间   |

当前 Phase 3 最小切片每个文档只写入首个文本版本，未来若支持编辑历史或多版本导入，可在该表上继续扩展。

### 5.0.3 `lesson_sessions`（Migration 3）

当前仓库在 Migration 3 (`lesson_session_foundation`) 里落地的是 Phase 5 课堂最小会话骨架，用于在接入真实 AI 课堂前先保存本地会话与来源引用。

| 字段           | 类型 | 约束                                          | 说明                 |
| -------------- | ---- | --------------------------------------------- | -------------------- |
| id             | TEXT | PK                                            | 课堂会话 ID          |
| title          | TEXT | NOT NULL                                      | 用户可见课堂标题     |
| status         | TEXT | NOT NULL                                      | `active/archived`    |
| document_id    | TEXT | FK `learning_documents(id)` ON DELETE CASCADE | 来源文档             |
| document_title | TEXT | NOT NULL                                      | 创建会话时的文档标题 |
| created_at     | TEXT | NOT NULL                                      | 创建时间             |
| updated_at     | TEXT | NOT NULL                                      | 最近更新时间         |

### 5.0.4 `lesson_source_anchors`（Migration 3）

| 字段         | 类型    | 约束                                          | 说明                         |
| ------------ | ------- | --------------------------------------------- | ---------------------------- |
| id           | TEXT    | PK                                            | 来源锚点 ID                  |
| lesson_id    | TEXT    | FK `lesson_sessions(id)` ON DELETE CASCADE    | 所属课堂会话                 |
| document_id  | TEXT    | FK `learning_documents(id)` ON DELETE CASCADE | 来源文档                     |
| start_offset | INTEGER | NOT NULL, `CHECK (start_offset >= 0)`         | 当前文本版本中的起始字符位置 |
| end_offset   | INTEGER | NOT NULL, `CHECK (end_offset > start_offset)` | 当前文本版本中的结束字符位置 |
| snippet      | TEXT    | NOT NULL                                      | 创建会话时使用的来源片段     |

当前最小切片只保存文本 offset 与 snippet；PDF 页码、block、chunk、bounding box 和引用高亮属于后续扩展。

### 5.0.5 `lesson_messages`（Migration 4）

当前仓库在 Migration 4 (`lesson_message_foundation`) 里落地课堂消息基础。该表先服务于本地 Mock Tutor 首轮提问，后续可扩展为真实 Provider 运行记录与多轮课堂消息。

| 字段                   | 类型    | 约束                                       | 说明                                  |
| ---------------------- | ------- | ------------------------------------------ | ------------------------------------- |
| id                     | TEXT    | PK                                         | 消息 ID                               |
| lesson_id              | TEXT    | FK `lesson_sessions(id)` ON DELETE CASCADE | 所属课堂会话                          |
| role                   | TEXT    | NOT NULL                                   | `system/tutor/learner`                |
| content                | TEXT    | NOT NULL                                   | 消息正文；当前首问只引用选中 snippet  |
| source_anchor_ids_json | TEXT    | NOT NULL                                   | JSON 字符串数组，指向本消息引用的锚点 |
| prompt_version         | TEXT    | NOT NULL                                   | 生成该消息的 Prompt 版本占位          |
| message_index          | INTEGER | NOT NULL, `CHECK (message_index >= 0)`     | 会话内消息顺序                        |
| created_at             | TEXT    | NOT NULL                                   | 消息创建时间                          |

索引与约束：

- `role` 通过 `CHECK` 约束限制为 `system/tutor/learner`。
- `UNIQUE(lesson_id,message_index)` 保证同一课堂内消息顺序不重复。
- 当前不保存 Provider 请求、token、原始 prompt 或错误详情；这些属于下一阶段 Model Run 记录。

> 下述 5.1 起的表结构仍保留为更完整文档导入/解析路线的目标蓝图，其中多数尚未实现。

### 5.1 `documents`

| 字段              | 类型    | 约束                  | 说明                              |
| ----------------- | ------- | --------------------- | --------------------------------- |
| id                | TEXT    | PK                    | 文档 ID                           |
| document_type     | TEXT    | NOT NULL              | `textbook/paper/generic`          |
| title             | TEXT    | NOT NULL              | 标题                              |
| subtitle          | TEXT    | NULL                  | 副标题                            |
| authors_json      | TEXT    | NOT NULL DEFAULT '[]' | 作者列表                          |
| language          | TEXT    | NULL                  | 主要语言                          |
| original_filename | TEXT    | NOT NULL              | 原文件名                          |
| storage_key       | TEXT    | NOT NULL UNIQUE       | 内部文件引用                      |
| file_sha256       | TEXT    | NOT NULL              | 文件哈希                          |
| file_size_bytes   | INTEGER | NOT NULL              | 文件大小                          |
| page_count        | INTEGER | NULL                  | 页数                              |
| parse_version     | INTEGER | NOT NULL DEFAULT 1    | 解析数据版本                      |
| status            | TEXT    | NOT NULL              | `importing/ready/failed/deleting` |
| text_quality      | TEXT    | NULL                  | `good/partial/none/unknown`       |
| imported_at       | TEXT    | NULL                  | 完成导入时间                      |
| created_at        | TEXT    | NOT NULL              | 创建时间                          |
| updated_at        | TEXT    | NOT NULL              | 更新时间                          |
| deleted_at        | TEXT    | NULL                  | 软删除时间                        |

索引：

- `UNIQUE(file_sha256)` 首版用于重复检测；若未来允许同文件多个副本，再改为普通索引。
- `(document_type, status)`。
- `title` 普通索引用于文档库排序或筛选。

### 5.2 `document_import_jobs`

| 字段                | 类型    | 约束                   | 说明                                        |
| ------------------- | ------- | ---------------------- | ------------------------------------------- |
| id                  | TEXT    | PK                     | Job ID                                      |
| document_id         | TEXT    | FK documents, NULLABLE | 复制前可能尚未建立文档                      |
| source_display_name | TEXT    | NOT NULL               | UI 显示文件名                               |
| stage               | TEXT    | NOT NULL               | 当前阶段                                    |
| progress_current    | INTEGER | NULL                   | 当前进度                                    |
| progress_total      | INTEGER | NULL                   | 总进度                                      |
| status              | TEXT    | NOT NULL               | `queued/running/succeeded/failed/cancelled` |
| attempt_count       | INTEGER | NOT NULL DEFAULT 0     | 尝试次数                                    |
| error_code          | TEXT    | NULL                   | 稳定错误码                                  |
| error_message       | TEXT    | NULL                   | 脱敏错误说明                                |
| retryable           | INTEGER | NOT NULL DEFAULT 0     | 是否可重试                                  |
| checkpoint_json     | TEXT    | NULL                   | 恢复检查点                                  |
| started_at          | TEXT    | NULL                   | 开始时间                                    |
| finished_at         | TEXT    | NULL                   | 结束时间                                    |
| created_at          | TEXT    | NOT NULL               | 创建时间                                    |
| updated_at          | TEXT    | NOT NULL               | 更新时间                                    |

索引：`(status, updated_at)`、`document_id`。

阶段枚举：

```text
SELECTED, COPYING, VALIDATING, EXTRACTING,
STRUCTURING, CHUNKING, INDEXING, READY
```

### 5.3 `document_pages`

| 字段              | 类型    | 约束                           | 说明             |
| ----------------- | ------- | ------------------------------ | ---------------- |
| id                | TEXT    | PK                             | 页面 ID          |
| document_id       | TEXT    | FK documents ON DELETE CASCADE | 文档             |
| page_number       | INTEGER | NOT NULL                       | 从 1 开始        |
| width             | REAL    | NULL                           | 页面宽度         |
| height            | REAL    | NULL                           | 页面高度         |
| raw_text          | TEXT    | NOT NULL DEFAULT ''            | 原始文本         |
| normalized_text   | TEXT    | NOT NULL DEFAULT ''            | 规范化文本       |
| text_quality      | TEXT    | NOT NULL                       | 页面文本质量     |
| rendered_asset_id | TEXT    | NULL                           | 可选页面渲染资产 |
| created_at        | TEXT    | NOT NULL                       | 创建时间         |

唯一约束：`UNIQUE(document_id, page_number)`。

### 5.4 `document_blocks`

保存 PDF 布局级内容。

| 字段          | 类型    | 约束                                | 说明                                              |
| ------------- | ------- | ----------------------------------- | ------------------------------------------------- |
| id            | TEXT    | PK                                  | Block ID                                          |
| page_id       | TEXT    | FK document_pages ON DELETE CASCADE | 页面                                              |
| block_index   | INTEGER | NOT NULL                            | 页面内顺序                                        |
| block_type    | TEXT    | NOT NULL                            | `text/heading/caption/formula/table/figure/other` |
| text          | TEXT    | NOT NULL DEFAULT ''                 | 内容                                              |
| bbox_json     | TEXT    | NULL                                | 坐标                                              |
| style_json    | TEXT    | NULL                                | 字号、字体等解析信息                              |
| reading_order | INTEGER | NULL                                | 重建后的阅读顺序                                  |
| content_hash  | TEXT    | NOT NULL                            | 内容哈希                                          |
| created_at    | TEXT    | NOT NULL                            | 创建时间                                          |

唯一约束：`UNIQUE(page_id, block_index)`。

### 5.5 `document_assets`

| 字段         | 类型 | 约束                                | 说明                                   |
| ------------ | ---- | ----------------------------------- | -------------------------------------- |
| id           | TEXT | PK                                  | Asset ID                               |
| document_id  | TEXT | FK documents ON DELETE CASCADE      | 文档                                   |
| page_id      | TEXT | FK document_pages ON DELETE CASCADE | 页面                                   |
| asset_type   | TEXT | NOT NULL                            | `page_image/figure/table/formula/crop` |
| storage_key  | TEXT | NOT NULL UNIQUE                     | 内部文件引用                           |
| bbox_json    | TEXT | NULL                                | 页面坐标                               |
| caption      | TEXT | NULL                                | Caption                                |
| content_hash | TEXT | NOT NULL                            | 资产哈希                               |
| created_at   | TEXT | NOT NULL                            | 创建时间                               |

### 5.6 `document_outlines`

| 字段        | 类型    | 约束                            | 说明                    |
| ----------- | ------- | ------------------------------- | ----------------------- |
| id          | TEXT    | PK                              | Outline ID              |
| document_id | TEXT    | FK documents ON DELETE CASCADE  | 文档                    |
| parent_id   | TEXT    | FK self ON DELETE CASCADE, NULL | 父节点                  |
| title       | TEXT    | NOT NULL                        | 标题                    |
| level       | INTEGER | NOT NULL                        | 层级                    |
| order_index | INTEGER | NOT NULL                        | 同级顺序                |
| page_start  | INTEGER | NOT NULL                        | 起始页                  |
| page_end    | INTEGER | NULL                            | 结束页                  |
| source      | TEXT    | NOT NULL                        | `pdf/heuristic/ai/user` |
| confidence  | REAL    | NULL                            | 置信度                  |
| created_at  | TEXT    | NOT NULL                        | 创建时间                |
| updated_at  | TEXT    | NOT NULL                        | 更新时间                |

### 5.7 `document_chunks`

| 字段           | 类型    | 约束                           | 说明          |
| -------------- | ------- | ------------------------------ | ------------- |
| id             | TEXT    | PK                             | Chunk ID      |
| document_id    | TEXT    | FK documents ON DELETE CASCADE | 文档          |
| outline_id     | TEXT    | FK document_outlines SET NULL  | 所属章节      |
| chunk_index    | INTEGER | NOT NULL                       | 文档内顺序    |
| text           | TEXT    | NOT NULL                       | 检索文本      |
| token_count    | INTEGER | NULL                           | 估计 Token    |
| page_start     | INTEGER | NOT NULL                       | 起始页        |
| page_end       | INTEGER | NOT NULL                       | 结束页        |
| block_ids_json | TEXT    | NOT NULL                       | 来源 Block ID |
| content_hash   | TEXT    | NOT NULL                       | 内容哈希      |
| parser_version | INTEGER | NOT NULL                       | 生成版本      |
| created_at     | TEXT    | NOT NULL                       | 创建时间      |

唯一约束：`UNIQUE(document_id, parser_version, content_hash)`。

索引：`(document_id, chunk_index)`、`outline_id`。

### 5.8 `document_chunks_fts`

FTS5 虚表，至少索引：

```text
chunk_id UNINDEXED
document_id UNINDEXED
section_title
body
```

该表是派生索引，不作为真实 Chunk 的唯一数据源。重建必须从 `document_chunks` 完成。

## 6. 教材领域

### 6.1 `textbook_profiles`

| 字段          | 类型 | 约束                              | 说明       |
| ------------- | ---- | --------------------------------- | ---------- |
| document_id   | TEXT | PK/FK documents ON DELETE CASCADE | 教材文档   |
| subject       | TEXT | NULL                              | 学科       |
| edition       | TEXT | NULL                              | 版本       |
| difficulty    | TEXT | NULL                              | 难度       |
| metadata_json | TEXT | NOT NULL DEFAULT '{}'             | 扩展元数据 |
| created_at    | TEXT | NOT NULL                          | 创建时间   |
| updated_at    | TEXT | NOT NULL                          | 更新时间   |

### 6.2 `concepts`

| 字段           | 类型 | 约束     | 说明                       |
| -------------- | ---- | -------- | -------------------------- |
| id             | TEXT | PK       | 概念 ID                    |
| canonical_name | TEXT | NOT NULL | 标准名                     |
| description    | TEXT | NULL     | 简要定义                   |
| status         | TEXT | NOT NULL | `draft/confirmed/archived` |
| source         | TEXT | NOT NULL | `ai/user/system`           |
| created_at     | TEXT | NOT NULL | 创建时间                   |
| updated_at     | TEXT | NOT NULL | 更新时间                   |

### 6.3 `concept_relations`

| 字段            | 类型 | 约束                          | 说明                                     |
| --------------- | ---- | ----------------------------- | ---------------------------------------- |
| id              | TEXT | PK                            | 关系 ID                                  |
| from_concept_id | TEXT | FK concepts ON DELETE CASCADE | 起点                                     |
| to_concept_id   | TEXT | FK concepts ON DELETE CASCADE | 终点                                     |
| relation_type   | TEXT | NOT NULL                      | `prerequisite/part_of/related/contrasts` |
| confidence      | REAL | NULL                          | 置信度                                   |
| source          | TEXT | NOT NULL                      | 来源                                     |
| created_at      | TEXT | NOT NULL                      | 创建时间                                 |

唯一约束：`UNIQUE(from_concept_id, to_concept_id, relation_type)`。

### 6.4 `concept_sources`

| 字段        | 类型 | 约束                                 | 说明                                        |
| ----------- | ---- | ------------------------------------ | ------------------------------------------- |
| id          | TEXT | PK                                   | 关联 ID                                     |
| concept_id  | TEXT | FK concepts ON DELETE CASCADE        | 概念                                        |
| document_id | TEXT | FK documents ON DELETE CASCADE       | 文档                                        |
| chunk_id    | TEXT | FK document_chunks ON DELETE CASCADE | Chunk                                       |
| relevance   | TEXT | NOT NULL                             | `definition/example/derivation/application` |
| created_at  | TEXT | NOT NULL                             | 创建时间                                    |

### 6.5 `learning_objectives`

| 字段           | 类型    | 约束                           | 说明                                       |
| -------------- | ------- | ------------------------------ | ------------------------------------------ |
| id             | TEXT    | PK                             | 目标 ID                                    |
| document_id    | TEXT    | FK documents ON DELETE CASCADE | 教材                                       |
| outline_id     | TEXT    | FK document_outlines SET NULL  | 章节                                       |
| concept_id     | TEXT    | FK concepts SET NULL           | 概念                                       |
| description    | TEXT    | NOT NULL                       | 可检验目标                                 |
| objective_type | TEXT    | NOT NULL                       | `understand/derive/apply/compare/critique` |
| status         | TEXT    | NOT NULL                       | `draft/confirmed/archived`                 |
| order_index    | INTEGER | NOT NULL                       | 顺序                                       |
| created_at     | TEXT    | NOT NULL                       | 创建时间                                   |
| updated_at     | TEXT    | NOT NULL                       | 更新时间                                   |

## 7. 论文领域

论文表在论文功能阶段通过独立 Migration 加入，不阻塞教材 MVP。

### 7.1 `paper_profiles`

| 字段             | 类型    | 约束                              | 说明       |
| ---------------- | ------- | --------------------------------- | ---------- |
| document_id      | TEXT    | PK/FK documents ON DELETE CASCADE | 论文文档   |
| doi              | TEXT    | NULL                              | DOI        |
| arxiv_id         | TEXT    | NULL                              | arXiv ID   |
| venue            | TEXT    | NULL                              | 期刊或会议 |
| publication_year | INTEGER | NULL                              | 年份       |
| abstract         | TEXT    | NULL                              | 摘要       |
| keywords_json    | TEXT    | NOT NULL DEFAULT '[]'             | 关键词     |
| metadata_json    | TEXT    | NOT NULL DEFAULT '{}'             | 扩展元数据 |
| created_at       | TEXT    | NOT NULL                          | 创建时间   |
| updated_at       | TEXT    | NOT NULL                          | 更新时间   |

### 7.2 `paper_analysis_items`

统一保存结构化论文分析单元，避免为每种分析结果建立过多稀疏表。

| 字段                    | 类型 | 约束                                             | 说明                                                            |
| ----------------------- | ---- | ------------------------------------------------ | --------------------------------------------------------------- |
| id                      | TEXT | PK                                               | 分析项 ID                                                       |
| document_id             | TEXT | FK paper_profiles(document_id) ON DELETE CASCADE | 论文                                                            |
| item_type               | TEXT | NOT NULL                                         | `problem/contribution/method/assumption/limitation/future_work` |
| title                   | TEXT | NULL                                             | 标题                                                            |
| content                 | TEXT | NOT NULL                                         | 内容                                                            |
| status                  | TEXT | NOT NULL                                         | `draft/confirmed/rejected`                                      |
| source                  | TEXT | NOT NULL                                         | `ai/user/imported`                                              |
| confidence              | REAL | NULL                                             | 置信度                                                          |
| created_by_model_run_id | TEXT | FK model_runs SET NULL                           | 生成调用                                                        |
| created_at              | TEXT | NOT NULL                                         | 创建时间                                                        |
| updated_at              | TEXT | NOT NULL                                         | 更新时间                                                        |

### 7.3 `paper_claims`

| 字段        | 类型 | 约束                                             | 说明                                           |
| ----------- | ---- | ------------------------------------------------ | ---------------------------------------------- |
| id          | TEXT | PK                                               | Claim ID                                       |
| document_id | TEXT | FK paper_profiles(document_id) ON DELETE CASCADE | 论文                                           |
| claim_text  | TEXT | NOT NULL                                         | 论点                                           |
| claim_type  | TEXT | NOT NULL                                         | `main/novelty/performance/causal/interpretive` |
| status      | TEXT | NOT NULL                                         | `draft/confirmed/disputed`                     |
| created_at  | TEXT | NOT NULL                                         | 创建时间                                       |
| updated_at  | TEXT | NOT NULL                                         | 更新时间                                       |

### 7.4 `paper_experiments`

| 字段           | 类型 | 约束                                             | 说明                 |
| -------------- | ---- | ------------------------------------------------ | -------------------- |
| id             | TEXT | PK                                               | Experiment ID        |
| document_id    | TEXT | FK paper_profiles(document_id) ON DELETE CASCADE | 论文                 |
| name           | TEXT | NOT NULL                                         | 实验名               |
| purpose        | TEXT | NULL                                             | 验证目的             |
| setup_json     | TEXT | NOT NULL DEFAULT '{}'                            | 数据集、基线、指标等 |
| result_summary | TEXT | NULL                                             | 结果摘要             |
| limitations    | TEXT | NULL                                             | 实验局限             |
| created_at     | TEXT | NOT NULL                                         | 创建时间             |
| updated_at     | TEXT | NOT NULL                                         | 更新时间             |

### 7.5 `paper_evidence_links`

连接论文观点、实验和来源 Chunk。

| 字段          | 类型 | 约束                                 | 说明                                     |
| ------------- | ---- | ------------------------------------ | ---------------------------------------- |
| id            | TEXT | PK                                   | Evidence ID                              |
| claim_id      | TEXT | FK paper_claims ON DELETE CASCADE    | 被支持或挑战的论点                       |
| experiment_id | TEXT | FK paper_experiments SET NULL        | 可选实验                                 |
| chunk_id      | TEXT | FK document_chunks ON DELETE CASCADE | 原文证据                                 |
| asset_id      | TEXT | FK document_assets SET NULL          | 可选图表                                 |
| relation      | TEXT | NOT NULL                             | `supports/weakens/qualifies/contradicts` |
| explanation   | TEXT | NULL                                 | 关系说明                                 |
| created_at    | TEXT | NOT NULL                             | 创建时间                                 |

### 7.6 `paper_references`

| 字段               | 类型    | 约束                                             | 说明             |
| ------------------ | ------- | ------------------------------------------------ | ---------------- |
| id                 | TEXT    | PK                                               | Reference ID     |
| document_id        | TEXT    | FK paper_profiles(document_id) ON DELETE CASCADE | 来源论文         |
| ordinal            | INTEGER | NULL                                             | 引用序号         |
| raw_text           | TEXT    | NOT NULL                                         | 原始参考文献文本 |
| title              | TEXT    | NULL                                             | 解析标题         |
| authors_json       | TEXT    | NOT NULL DEFAULT '[]'                            | 作者             |
| year               | INTEGER | NULL                                             | 年份             |
| doi                | TEXT    | NULL                                             | DOI              |
| arxiv_id           | TEXT    | NULL                                             | arXiv ID         |
| linked_document_id | TEXT    | FK documents SET NULL                            | 若已导入则连接   |
| created_at         | TEXT    | NOT NULL                                         | 创建时间         |

### 7.7 `research_insights`

| 字段              | 类型 | 约束                           | 说明                                            |
| ----------------- | ---- | ------------------------------ | ----------------------------------------------- |
| id                | TEXT | PK                             | Insight ID                                      |
| document_id       | TEXT | FK documents ON DELETE CASCADE | 来源文档                                        |
| lesson_session_id | TEXT | FK lesson_sessions SET NULL    | 来源课堂                                        |
| insight_type      | TEXT | NOT NULL                       | `question/idea/critique/replication/connection` |
| content           | TEXT | NOT NULL                       | 内容                                            |
| status            | TEXT | NOT NULL                       | `inbox/active/archived`                         |
| created_at        | TEXT | NOT NULL                       | 创建时间                                        |
| updated_at        | TEXT | NOT NULL                       | 更新时间                                        |

## 8. 课程与课堂

### 8.1 `courses`

| 字段        | 类型 | 约束     | 说明                        |
| ----------- | ---- | -------- | --------------------------- |
| id          | TEXT | PK       | Course ID                   |
| title       | TEXT | NOT NULL | 课程名                      |
| description | TEXT | NULL     | 描述                        |
| status      | TEXT | NOT NULL | `active/completed/archived` |
| created_at  | TEXT | NOT NULL | 创建时间                    |
| updated_at  | TEXT | NOT NULL | 更新时间                    |

### 8.2 `course_documents`

| 字段        | 类型    | 约束                           | 说明                           |
| ----------- | ------- | ------------------------------ | ------------------------------ |
| course_id   | TEXT    | FK courses ON DELETE CASCADE   | 课程                           |
| document_id | TEXT    | FK documents ON DELETE CASCADE | 文档                           |
| role        | TEXT    | NOT NULL                       | `primary/supplement/reference` |
| order_index | INTEGER | NOT NULL                       | 顺序                           |

主键：`(course_id, document_id)`。

### 8.3 `lesson_sessions`

| 字段                  | 类型 | 约束                            | 说明                                      |
| --------------------- | ---- | ------------------------------- | ----------------------------------------- |
| id                    | TEXT | PK                              | Session ID                                |
| workflow_type         | TEXT | NOT NULL                        | `textbook/paper/review`                   |
| course_id             | TEXT | FK courses SET NULL             | 可选课程                                  |
| document_id           | TEXT | FK documents SET NULL           | 主要文档                                  |
| learning_objective_id | TEXT | FK learning_objectives SET NULL | 教材目标                                  |
| paper_mode            | TEXT | NULL                            | 论文阅读模式                              |
| companion_id          | TEXT | FK companions SET NULL          | 可选伙伴                                  |
| provider_id           | TEXT | FK ai_providers SET NULL        | 使用的 Provider                           |
| current_state         | TEXT | NOT NULL                        | 状态机状态                                |
| status                | TEXT | NOT NULL                        | `active/paused/completed/abandoned/error` |
| branch_stack_json     | TEXT | NOT NULL DEFAULT '[]'           | 问题支线栈                                |
| started_at            | TEXT | NOT NULL                        | 开始时间                                  |
| completed_at          | TEXT | NULL                            | 完成时间                                  |
| created_at            | TEXT | NOT NULL                        | 创建时间                                  |
| updated_at            | TEXT | NOT NULL                        | 更新时间                                  |

索引：`(status, updated_at)`、`document_id`。

说明：`companion_id` 是最终逻辑 Schema 的字段；基础课堂迁移先不创建该列，由伙伴阶段的 `0010_companions_and_lesson_link.sql` 在创建 `companions` 后加入，避免前向外键。

### 8.4 `lesson_steps`

| 字段            | 类型    | 约束                                 | 说明                                 |
| --------------- | ------- | ------------------------------------ | ------------------------------------ |
| id              | TEXT    | PK                                   | Step ID                              |
| session_id      | TEXT    | FK lesson_sessions ON DELETE CASCADE | 课堂                                 |
| sequence_no     | INTEGER | NOT NULL                             | 顺序                                 |
| state_before    | TEXT    | NOT NULL                             | 前状态                               |
| state_after     | TEXT    | NOT NULL                             | 后状态                               |
| action_type     | TEXT    | NOT NULL                             | 教学动作                             |
| status          | TEXT    | NOT NULL                             | `started/completed/cancelled/failed` |
| idempotency_key | TEXT    | NOT NULL                             | 幂等键                               |
| model_run_id    | TEXT    | FK model_runs SET NULL               | 模型调用                             |
| started_at      | TEXT    | NOT NULL                             | 开始时间                             |
| completed_at    | TEXT    | NULL                                 | 完成时间                             |

唯一约束：`UNIQUE(session_id, sequence_no)`、`UNIQUE(idempotency_key)`。

### 8.5 `messages`

| 字段        | 类型    | 约束                                 | 说明                         |
| ----------- | ------- | ------------------------------------ | ---------------------------- |
| id          | TEXT    | PK                                   | Message ID                   |
| session_id  | TEXT    | FK lesson_sessions ON DELETE CASCADE | 课堂                         |
| step_id     | TEXT    | FK lesson_steps SET NULL             | 步骤                         |
| role        | TEXT    | NOT NULL                             | `user/assistant/system/tool` |
| content     | TEXT    | NOT NULL                             | 最终内容                     |
| status      | TEXT    | NOT NULL                             | `final/cancelled/failed`     |
| sequence_no | INTEGER | NOT NULL                             | 会话内顺序                   |
| created_at  | TEXT    | NOT NULL                             | 创建时间                     |

唯一约束：`UNIQUE(session_id, sequence_no)`。

### 8.6 `message_citations`

| 字段           | 类型    | 约束                                  | 说明        |
| -------------- | ------- | ------------------------------------- | ----------- |
| id             | TEXT    | PK                                    | Citation ID |
| message_id     | TEXT    | FK messages ON DELETE CASCADE         | 消息        |
| chunk_id       | TEXT    | FK document_chunks ON DELETE RESTRICT | Chunk       |
| page_start     | INTEGER | NOT NULL                              | 起始页快照  |
| page_end       | INTEGER | NOT NULL                              | 结束页快照  |
| block_ids_json | TEXT    | NOT NULL                              | Block 快照  |
| quote_text     | TEXT    | NULL                                  | 短引文快照  |
| relevance      | REAL    | NULL                                  | 相关度      |
| order_index    | INTEGER | NOT NULL                              | 显示顺序    |
| created_at     | TEXT    | NOT NULL                              | 创建时间    |

## 9. 评价、误区与掌握

### 9.1 `teach_backs`

| 字段       | 类型    | 约束                                 | 说明          |
| ---------- | ------- | ------------------------------------ | ------------- |
| id         | TEXT    | PK                                   | Teach-back ID |
| session_id | TEXT    | FK lesson_sessions ON DELETE CASCADE | 课堂          |
| step_id    | TEXT    | FK lesson_steps SET NULL             | 步骤          |
| concept_id | TEXT    | FK concepts SET NULL                 | 可选概念      |
| prompt     | TEXT    | NOT NULL                             | 复述任务      |
| response   | TEXT    | NOT NULL                             | 用户复述      |
| attempt_no | INTEGER | NOT NULL                             | 尝试次数      |
| created_at | TEXT    | NOT NULL                             | 创建时间      |

### 9.2 `assessment_results`

| 字段                    | 类型 | 约束                             | 说明          |
| ----------------------- | ---- | -------------------------------- | ------------- |
| id                      | TEXT | PK                               | Assessment ID |
| teach_back_id           | TEXT | FK teach_backs ON DELETE CASCADE | 被评价复述    |
| model_run_id            | TEXT | FK model_runs SET NULL           | 评价调用      |
| correctness             | REAL | NOT NULL                         | 正确性        |
| completeness            | REAL | NOT NULL                         | 完整性        |
| causality               | REAL | NOT NULL                         | 因果性        |
| clarity                 | REAL | NOT NULL                         | 清晰度        |
| transferability         | REAL | NOT NULL                         | 迁移性        |
| correct_parts_json      | TEXT | NOT NULL                         | 正确部分      |
| gaps_json               | TEXT | NOT NULL                         | 缺失点        |
| misconceptions_json     | TEXT | NOT NULL                         | 错误判断      |
| evidence_chunk_ids_json | TEXT | NOT NULL                         | 评价依据      |
| created_at              | TEXT | NOT NULL                         | 创建时间      |

### 9.3 `misconceptions`

| 字段                  | 类型    | 约束                        | 说明                        |
| --------------------- | ------- | --------------------------- | --------------------------- |
| id                    | TEXT    | PK                          | Misconception ID            |
| concept_id            | TEXT    | FK concepts SET NULL        | 关联概念                    |
| document_id           | TEXT    | FK documents SET NULL       | 关联文档                    |
| description           | TEXT    | NOT NULL                    | 误区描述                    |
| status                | TEXT    | NOT NULL                    | `active/improving/resolved` |
| first_seen_session_id | TEXT    | FK lesson_sessions SET NULL | 首次发现                    |
| last_seen_at          | TEXT    | NOT NULL                    | 最近出现                    |
| occurrence_count      | INTEGER | NOT NULL DEFAULT 1          | 次数                        |
| created_at            | TEXT    | NOT NULL                    | 创建时间                    |
| updated_at            | TEXT    | NOT NULL                    | 更新时间                    |

### 9.4 `mastery_evidence`

| 字段          | 类型 | 约束                          | 说明                                              |
| ------------- | ---- | ----------------------------- | ------------------------------------------------- |
| id            | TEXT | PK                            | Evidence ID                                       |
| concept_id    | TEXT | FK concepts ON DELETE CASCADE | 概念                                              |
| session_id    | TEXT | FK lesson_sessions SET NULL   | 来源课堂                                          |
| evidence_type | TEXT | NOT NULL                      | `precheck/teach_back/transfer/review/self_report` |
| result        | TEXT | NOT NULL                      | `success/partial/failure`                         |
| score         | REAL | NULL                          | 可选分数                                          |
| payload_json  | TEXT | NOT NULL DEFAULT '{}'         | 细节                                              |
| occurred_at   | TEXT | NOT NULL                      | 发生时间                                          |
| created_at    | TEXT | NOT NULL                      | 创建时间                                          |

### 9.5 `learner_concept_states`

这是聚合快照，可从 `mastery_evidence` 重算。

| 字段             | 类型 | 约束                             | 说明                                            |
| ---------------- | ---- | -------------------------------- | ----------------------------------------------- |
| concept_id       | TEXT | PK/FK concepts ON DELETE CASCADE | 概念                                            |
| mastery_level    | TEXT | NOT NULL                         | `unknown/exposed/developing/proficient/durable` |
| confidence       | REAL | NOT NULL                         | 聚合置信度                                      |
| last_evidence_at | TEXT | NULL                             | 最近证据                                        |
| next_review_at   | TEXT | NULL                             | 下次复习                                        |
| updated_at       | TEXT | NOT NULL                         | 更新时间                                        |

## 10. 复习

### 10.1 `review_items`

| 字段                 | 类型 | 约束                  | 说明                                         |
| -------------------- | ---- | --------------------- | -------------------------------------------- |
| id                   | TEXT | PK                    | Review Item ID                               |
| item_type            | TEXT | NOT NULL              | `concept/question/paper_claim/misconception` |
| concept_id           | TEXT | FK concepts SET NULL  | 可选概念                                     |
| document_id          | TEXT | FK documents SET NULL | 可选文档                                     |
| source_entity_id     | TEXT | NULL                  | 其他来源实体                                 |
| prompt               | TEXT | NOT NULL              | 主动回忆提示                                 |
| answer_outline_json  | TEXT | NOT NULL              | 答案要点                                     |
| scheduler_type       | TEXT | NOT NULL              | 调度器标识                                   |
| scheduler_state_json | TEXT | NOT NULL              | 调度状态                                     |
| due_at               | TEXT | NOT NULL              | 到期时间                                     |
| status               | TEXT | NOT NULL              | `active/suspended/retired`                   |
| created_at           | TEXT | NOT NULL              | 创建时间                                     |
| updated_at           | TEXT | NOT NULL              | 更新时间                                     |

索引：`(status, due_at)`。

### 10.2 `review_events`

| 字段                | 类型 | 约束                              | 说明                              |
| ------------------- | ---- | --------------------------------- | --------------------------------- |
| id                  | TEXT | PK                                | Event ID                          |
| review_item_id      | TEXT | FK review_items ON DELETE CASCADE | 项目                              |
| session_id          | TEXT | FK lesson_sessions SET NULL       | 可选复习课堂                      |
| response            | TEXT | NOT NULL                          | 用户回答                          |
| rating              | TEXT | NOT NULL                          | `again/hard/good/easy` 或内部映射 |
| score               | REAL | NULL                              | 可选评价                          |
| previous_state_json | TEXT | NOT NULL                          | 调度前状态                        |
| next_state_json     | TEXT | NOT NULL                          | 调度后状态                        |
| reviewed_at         | TEXT | NOT NULL                          | 复习时间                          |
| created_at          | TEXT | NOT NULL                          | 创建时间                          |

## 11. 伙伴

### 11.1 `companions`

| 字段                      | 类型    | 约束               | 说明                   |
| ------------------------- | ------- | ------------------ | ---------------------- |
| id                        | TEXT    | PK                 | Companion ID           |
| name                      | TEXT    | NOT NULL           | 名称                   |
| description               | TEXT    | NULL               | 简介                   |
| speaking_style_json       | TEXT    | NOT NULL           | 表达风格               |
| teaching_preferences_json | TEXT    | NOT NULL           | 教学偏好，不覆盖状态机 |
| is_builtin                | INTEGER | NOT NULL DEFAULT 0 | 内置模板               |
| status                    | TEXT    | NOT NULL           | `active/archived`      |
| created_at                | TEXT    | NOT NULL           | 创建时间               |
| updated_at                | TEXT    | NOT NULL           | 更新时间               |

### 11.2 `companion_memories`

| 字段         | 类型 | 约束                            | 说明                            |
| ------------ | ---- | ------------------------------- | ------------------------------- |
| id           | TEXT | PK                              | Memory ID                       |
| companion_id | TEXT | FK companions ON DELETE CASCADE | 伙伴                            |
| session_id   | TEXT | FK lesson_sessions SET NULL     | 来源课堂                        |
| memory_type  | TEXT | NOT NULL                        | `episodic/preference/narrative` |
| content      | TEXT | NOT NULL                        | 记忆内容                        |
| salience     | REAL | NOT NULL DEFAULT 0.5            | 重要性                          |
| status       | TEXT | NOT NULL                        | `active/archived`               |
| created_at   | TEXT | NOT NULL                        | 创建时间                        |

该表不得存储或覆盖 `learner_concept_states`。

## 12. Prompt 与模型运行

### 12.1 `prompt_templates`

| 字段               | 类型    | 约束     | 说明                   |
| ------------------ | ------- | -------- | ---------------------- |
| id                 | TEXT    | PK       | Template ID            |
| key                | TEXT    | NOT NULL | 模板逻辑名             |
| version            | INTEGER | NOT NULL | 版本                   |
| template_text      | TEXT    | NOT NULL | 内容                   |
| input_schema_json  | TEXT    | NOT NULL | 输入 Schema            |
| output_schema_json | TEXT    | NULL     | 输出 Schema            |
| template_hash      | TEXT    | NOT NULL | 哈希                   |
| status             | TEXT    | NOT NULL | `draft/active/retired` |
| created_at         | TEXT    | NOT NULL | 创建时间               |

唯一约束：`UNIQUE(key, version)`；同一 `key` 最多一个 `active`。

### 12.2 `model_runs`

| 字段                     | 类型    | 约束                     | 说明                                           |
| ------------------------ | ------- | ------------------------ | ---------------------------------------------- |
| id                       | TEXT    | PK                       | Model Run ID                                   |
| provider_id              | TEXT    | FK ai_providers SET NULL | Provider                                       |
| model_name               | TEXT    | NOT NULL                 | 模型快照                                       |
| operation                | TEXT    | NOT NULL                 | `tutor/evaluate/course_map/paper_analysis/...` |
| prompt_manifest_json     | TEXT    | NOT NULL                 | Prompt ID、版本和哈希                          |
| input_summary_json       | TEXT    | NOT NULL                 | 脱敏输入摘要                                   |
| retrieved_chunk_ids_json | TEXT    | NOT NULL DEFAULT '[]'    | 检索证据                                       |
| status                   | TEXT    | NOT NULL                 | `started/succeeded/failed/cancelled`           |
| error_code               | TEXT    | NULL                     | 错误码                                         |
| latency_ms               | INTEGER | NULL                     | 延迟                                           |
| input_tokens             | INTEGER | NULL                     | 输入 Token                                     |
| output_tokens            | INTEGER | NULL                     | 输出 Token                                     |
| estimated_cost           | REAL    | NULL                     | 可选估算成本                                   |
| structured_output_valid  | INTEGER | NULL                     | 校验结果                                       |
| started_at               | TEXT    | NOT NULL                 | 开始时间                                       |
| finished_at              | TEXT    | NULL                     | 结束时间                                       |

默认不保存未经脱敏的完整请求和响应。若开发诊断模式允许临时保存，必须显式启用并有自动清理策略。

## 13. 数据不变量

1. `documents.status = ready` 时必须至少存在一条 `document_pages`。
2. `document_chunks` 的页范围必须属于同一文档。
3. `message_citations.chunk_id` 必须与课堂主要文档或允许的补充文档关联。
4. 只有 `lesson_steps.status = completed` 才能作为掌握证据来源。
5. `learner_concept_states` 不得在没有新增或重算证据的情况下任意修改。
6. Provider Key 更新必须先成功写入 Secret Vault，再更新 `secret_ref`；失败时保留旧引用。
7. 文档删除前必须处理课堂、引用和复习记录：默认软删除文档并保留历史来源快照。
8. FTS 或 Embedding 索引失败不得把原始页和块回滚删除；文档可标记为待重建索引。
9. 课后整理必须使用一个事务或幂等分步事务，重复执行不得生成重复复习项目。

## 14. Migration 计划

建议按功能增量创建：

```text
0001_system_and_providers.sql
0002_prompts_and_model_runs.sql
0003_documents_and_import_jobs.sql
0004_document_index.sql
0005_textbook_curriculum.sql
0006_lessons_and_messages.sql
0007_assessment_and_mastery.sql
0008_review.sql
0009_papers.sql
0010_companions_and_lesson_link.sql
```

Migration 规则：

- 每个迁移在空数据库和上一版本数据库上测试。
- 生产迁移不依赖手工 SQL。
- 破坏性迁移先复制数据到新表，验证后再切换。
- 应用启动时先备份数据库，再执行非平凡迁移。
- 迁移失败时阻止应用进入可写模式，并提供诊断和恢复入口。

## 15. 备份与导出

MVP 至少支持：

- 关闭写事务后生成 SQLite 一致性备份。
- 导出脱敏诊断信息。
- 删除 Provider 时同步删除安全存储中的 Key。

后续可以提供完整学习数据包导出，但必须区分：

- 用户原始 PDF。
- 应用数据库。
- 派生索引和缓存。
- 加密密钥与 Provider 配置。

默认导出不得包含可被其他机器直接解密的 API Key。
