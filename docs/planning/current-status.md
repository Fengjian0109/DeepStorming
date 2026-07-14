# DeepStorming 当前开发状态

- 更新时间：2026-07-14
- 当前分支：`codex/all-stages`
- 当前阶段：AI-first workspace redesign — Stage 3 rich conversation
- 状态：Stage 1–2 已完成；Stage 3 的结构化导师回复、单次修复与持久化已完成，正在推进 Markdown/LaTeX、引用卡片和 PDF 图片管线

## AI-first workspace redesign — Stage 3

已完成的结构化回复基础：

- AI 必须返回严格 `TutorTurn` JSON：动作描写、Markdown 正文、可验证文本引用和图片引用彼此分离。
- Application 校验字段、引用 chunk 归属及逐字 quote；首次无效时只允许同一 Provider 修复一次，第二次失败返回可重试的 `AI_GENERATION_FAILED`，不把无效内容写成导师消息。
- TutorTurn 通过 Contracts、Domain 与 SQLite `tutor_turn_json` 持久化，同时保留 `content` 兼容旧消息。
- Migration 18 为历史课堂保持可读，新消息可恢复完整结构化显示数据。

进行中：安全 Markdown/GFM 与 LaTeX 渲染、强调引用、PDF 图片提取和对话图片卡片。

## AI-first workspace redesign — Stage 2

已完成：

- Provider、导师/伙伴、学习者资料和课堂偏好统一进入设置中心；支持头像、性格、语气、擅长领域、严格度、苏格拉底强度、书籍/论文策略和自定义指令。
- 课堂不再自动退回到本地规则导师；未激活 Provider 时稳定返回 `AI_PROVIDER_REQUIRED`。Mock Provider 仅作为用户显式启用的开发/测试 Provider。
- 每次开课前必须选择导师与慢/标准/快三档节奏。新课程保存导师 revision 快照与节奏，后续编辑导师不会改写旧课记录。
- 导师性格、语气、领域、教学策略、自定义指令和课堂节奏已进入真实 AI system prompt。
- Migration 17 为 `lesson_sessions` 增加 `lesson_pace` 和 `tutor_snapshot_json`，并保持旧课程可读。

## AI-first workspace redesign — Stage 1 interface foundation

Stage 1 将桌面端从功能卡片堆叠页重构为“分层侧栏 + 对话主区”的工作空间，并保持既有业务能力和安全边界不变。

已完成：

- 可独立收起、拖拽调宽和一键全部收起/恢复的主副侧栏；侧栏与分隔线总宽度不超过窗口宽度的 50%，布局偏好只保存在 Renderer 本地 UI 存储中。
- 文档、课堂、设置统一进入工作空间壳层；Provider 管理移入设置，副侧栏按当前页面展示文档或按教材分组的课程历史。
- 文档导入改为顶部工具栏与对话框；详情默认只展示不超过 320 字符的摘要，完整正文和 PDF page/block 仅在用户打开阅读器时按需加载。
- 第一版 PDF 继续只支持具有可选择文本层的电子版 PDF；OCR 和扫描件不在本阶段范围内。
- 课堂主区只展示导师与学习者的连续对话；生成记录、证据、学习诊断、论文进度和复习任务移入信息抽屉。
- 固定底部输入框支持 Enter 发送、Shift+Enter 换行、输入法合成保护、取消生成、草稿保留、失败重试和智能自动滚动。
- 响应式和无障碍加固，包括窄屏默认收起副侧栏、键盘焦点、焦点恢复、滚动隔离与 reduced-motion。
- Electron E2E 覆盖设置中的 Mock Provider 生命周期，以及粘贴长文本、可选择文本 PDF 导入、紧凑详情、延迟阅读器、从文档开课、对话回复、抽屉查看和侧栏调整/收起的完整旅程。

本阶段没有修改 Domain、Application、Infrastructure、IPC contract 或数据库 schema；它是现有能力的 Renderer 信息架构与交互重构。

明确未完成：

- Markdown/LaTeX、强调引用、PDF 图片提取与聊天中的自动图像匹配。
- 下课保存记忆、课后复习/休息分流、课程完成语义和聊天记录 MD/PDF 导出。
- 剩余上下文低于阈值时的自动压缩、token 统计与默认 30% 阈值设置。

## 已完成

- Phase 0：需求、架构、数据库与开发计划基线。
- Phase 1：Electron 工程骨架、安全边界、类型安全 IPC 和基础打包。
- Phase 1 应用版本边界：Main 构建时注入根包版本，开发入口正确显示 DeepStorming 版本。
- macOS E2E：`pnpm test:e2e` 通过。
- Phase 2 设计：`docs/superpowers/specs/2026-07-10-phase-2-provider-foundation-design.md`。
- Phase 2 Provider 应用层：CRUD、激活、稳定错误映射与 Secret Vault 补偿顺序。
- Phase 2 SQLite Spike（2026-07-10T13:21:52Z）：`better-sqlite3@12.11.1` 与 `@types/better-sqlite3@7.6.13` 已锁定；Migration 1 创建 `app_settings`、`ai_providers`、`provider_write_requests` 和 `provider_test_operations`，包含 checksum、事务回滚和非空旧库升级前备份。
- Provider Repository：CRUD、revision CAS、唯一激活、原子引用检查删除、不可变写结果重放、JSON 运行时校验、Secret Ref 对账集合与连接测试状态转换均已持久化。
- 加密文件 Secret Vault：Electron safeStorage 窄适配器、0600 密文原子写入、严格 UUID 引用校验、幂等删除、启动孤儿与崩溃临时文件对账，以及非抛出清理失败报告器。
- Provider 连接测试与取消：应用层持久化 `testing/success/error/cancelled`，实现操作取消注册表、Mock 网关、OpenAI-compatible Chat Completions 网关和 Provider Gateway Factory；云 Provider 从 Vault 读取密钥，Mock 不读取 Vault。
- Provider 安全 IPC 与组合根：Main 进程打开并迁移 SQLite、初始化 Secret Vault、启动时对账 Secret refs、共享连接测试取消注册表，并通过显式 IPC/Preload API 暴露 Provider 管理能力。
- Provider 管理 UI：Renderer 仅依赖 Contracts 与本地 UI，支持创建、编辑、启用、删除确认、连接测试与取消；API Key 保持在表单本地状态，编辑时空 Key 表示保留原密钥。
- Provider E2E 与目录包持久化证明：开发版 E2E 使用临时 Electron `userData` 覆盖版本、安全 WebPreferences、Mock Provider 创建/启用/测试/编辑空 Key/延迟取消/删除/回到空状态；macOS 目录包 E2E 启动同一个临时 `userData` 两次，验证 Mock Provider 重启后仍可读取。
- Phase 2 ADR 与验收报告：`docs/adr/0006-sqlite-binding.md`、`docs/adr/0007-secret-vault.md` 与 `docs/planning/phase-2-acceptance-report.md` 已记录 SQLite Binding、Secret Vault、安全扫描、打包证据和 Phase 3 入口。
- Phase 3 文本文档库最小切片：
  - Domain：文档草稿规范化、字符计数、稳定 hash 输入与 `LearningDocument` 模型。
  - Contracts：文档 IPC channels、严格请求/响应 schema、文档业务错误码。
  - Application：文档列表、创建、详情、删除用例与稳定错误映射。
  - Infrastructure：Migration 2 `document_text_import`，落地 `learning_documents` 与 `document_text_versions`，并用 SHA-256 按正文内容做重复检测。
  - Main / Preload：显式文档 IPC、`window.deepstorming.documents` typed API，以及 IPC reject 时的稳定结果回退。
  - Renderer：默认首页切到文档库，支持粘贴文本、新建、`.txt/.md` 导入、详情查看、删除确认、失败保留草稿和稳定错误提示。
  - E2E：新增文档创建/导入/删除/重启持久化覆盖，并修复 `test:e2e` 中 `better-sqlite3` 原生模块增量构建目录损坏导致的重建噪音。
- Phase 4 文档消费基础最小切片：
  - Application：新增 `SearchDocuments` 用例，校验空 query 并映射稳定错误。
  - Infrastructure：SQLite 在最新 `document_text_versions` 上进行大小写不敏感正文匹配。
  - Contracts / Main / Preload：新增显式 `documents:search` channel 与 `window.deepstorming.documents.search(query)`。
  - Renderer：文档库支持正文搜索，展示 snippet、字符 offset，点击结果可打开详情。
  - E2E：文档导入流程覆盖正文搜索和搜索结果打开。
- Phase 5 课堂最小会话骨架：
  - Domain：新增 `LessonSession`、`LessonSourceAnchor`、`LessonStartDraft` 与规范化规则。
  - Application：新增 `StartLessonFromDocument`、`GetLessonSession`、`ListLessonSessions`，启动课堂前验证来源文档仍存在。
  - Infrastructure：Migration 3 `lesson_session_foundation`，落地 `lesson_sessions` 与 `lesson_source_anchors`。
  - Contracts / Main / Preload：新增显式 `lessons:list`、`lessons:start-from-document`、`lessons:get` 与 `window.deepstorming.lessons`。
  - Renderer：启用课堂导航，文档详情和搜索结果可启动本地课堂，课堂页展示会话和来源片段。
  - E2E：文档导入流程覆盖从搜索结果启动课堂、重启后课堂会话与来源片段仍可读取。
- Phase 5 课堂消息基础：
  - Domain / Contracts：新增 `LessonMessage`、消息角色枚举、Prompt 版本占位和严格 DTO 校验。
  - Application：`StartLessonFromDocument` 在创建本地课堂时生成确定性的首条 Mock Tutor 提问，内容只引用已选 snippet，不保存完整正文。
  - Infrastructure：Migration 4 `lesson_message_foundation`，新增 `lesson_messages`，随课堂事务性持久化消息、来源 anchor 引用和 `prompt_version`。
  - Renderer：课堂详情在来源证据下方展示“导师提问”和 Prompt 版本。
  - E2E：文档导入流程覆盖从搜索结果启动课堂后显示首条导师提问，重启后仍可读取。
- Phase 5 Prompt / Model Run 基础：
  - Domain / Contracts：新增 `LessonModelRun`、Prompt Manifest、脱敏输入摘要和运行状态枚举。
  - Application：首条 Mock Tutor 提问关联 `modelRunId`，记录 `lesson.mockTutor.firstQuestion` v1 的 hash、`mock-local` 模型名和 `succeeded` 状态。
  - Infrastructure：Migration 5 `lesson_model_run_foundation`，新增 `lesson_model_runs`，并在 `lesson_messages` 上新增可空 `model_run_id`。
  - Renderer：课堂详情新增“生成记录”，显示模型名、运行状态和 prompt manifest 版本。
  - E2E：文档导入流程覆盖生成记录在创建后和重启后可见。
- Phase 5 本地多轮课堂闭环：
  - Contracts / Main / Preload：新增显式 `lessons:reply` 与 `window.deepstorming.lessons.reply({ lessonId, content })`。
  - Application：新增 `SubmitLessonReply`，持久化 learner message，并生成 deterministic `lesson_tutor_follow_up` 追问。
  - Infrastructure：新增 Repository `save(session)`，事务性重写同一课堂的 messages/modelRuns；Migration 6 `lesson_follow_up_operation` 允许 follow-up operation。
  - Renderer：课堂详情新增“你的回答”表单，提交后展示学习者回答、导师追问和 follow-up Prompt Manifest。
  - E2E：文档课堂流程覆盖提交回答、下一轮追问、follow-up 生成记录，以及重启后的持久化读取。
- Phase 5 课堂运行恢复基础：
  - Domain / Contracts：新增 `LessonRunRetryDraft`、`lessons:retry-run` channel 和严格请求 schema。
  - Application：新增 `RetryLessonRun`，只允许 `failed/cancelled` 的 lesson model run 重试；成功重试时保留原失败 run，并追加新的 deterministic `lesson_tutor_follow_up` 消息和 `succeeded` run。
  - Main / Preload：组合根注入 `RetryLessonRun`，IPC 只做输入校验、调用单个 use case 和稳定错误映射；Preload 暴露 `window.deepstorming.lessons.retryRun({ lessonId, modelRunId })`。
  - Renderer：生成记录列表直接显示 `started/succeeded/failed/cancelled` 状态；对 `failed/cancelled` run 显示“重试生成 …”按钮，并覆盖 loading/success/error 反馈。
  - 数据库：无新增 migration；复用既有 `lesson_model_runs.status` 与 Repository `save(session)`，以追加新 run/message 的方式记录重试历史。
- Phase 5 Provider 课堂生成接入准备：
  - Application：`ProviderGatewayPort` 新增 `generateLessonTutorReply(input, token)`，为课堂追问生成提供可替换端口。
  - Infrastructure：Mock Gateway 用 deterministic 模板生成中文追问，并沿用取消语义；OpenAI-compatible Gateway 发送非流式 Chat Completions 请求，解析首个 assistant message content，并把空内容、缺失 choices、HTTP/网络/超时/取消映射为稳定 Provider 错误。
  - 安全边界：Gateway 请求不进入 Renderer；错误不包含 Authorization、API Key 或原始响应正文。
- Phase 5 Provider 课堂生成接线：
  - Application：新增 `LessonTutorReplyGeneratorPort` 与 `ProviderLessonTutorReplyGenerator`，由 Application 选择当前激活 Provider、读取 Vault 密钥并调用 Gateway；没有激活 Provider 时保留本地 mock fallback。
  - Lesson use cases：`SubmitLessonReply` 与 `RetryLessonRun` 支持注入 tutor generator；成功生成后把 Provider 返回的 content 写入 tutor message，并把 active provider 的 `providerId/modelName` 写入 `lesson_model_runs`。
  - Main composition root：复用同一个 `ProviderGatewayFactory`，把 Provider-backed tutor generator 注入课堂 reply/retry use case。
- Phase 5 Lesson Provider 运行状态持久化：
  - Application：`SubmitLessonReply` 与 `RetryLessonRun` 在调用 tutor generator 前先保存 learner message（reply 场景）和 `started` `lesson_tutor_follow_up` run。
  - 成功路径：Provider 返回后追加 tutor message，并把同一个 run 更新为 `succeeded`、补 `outputMessageId/finishedAt/providerId/modelName`。
  - 失败路径：Provider/generator 抛错时保留 learner message 和 `failed` run，`outputMessageId` 保持 `null`，课堂页重新加载后可看到失败记录并使用既有重试入口。
- Phase 5 Lesson run 安全错误摘要：
  - Domain / Contracts：`LessonModelRun` 新增 `errorSummary`，严格限制为稳定 `code/message/retryable` 或 `null`。
  - Infrastructure：Migration 7 `lesson_model_run_error_summary` 为 `lesson_model_runs` 新增 `error_summary_json` 可空字段；Repository 显式读写该字段并兼容历史空值。
  - Application：Provider/generator 失败时把 run 保存为 `failed`，并写入由稳定 `LessonUseCaseError` 派生的安全摘要；`started/succeeded` run 保持 `null`。
  - Renderer：生成记录展示安全错误消息，failed/cancelled run 保留重试入口。
  - 安全边界：不持久化 API Key、Authorization header、原始 Provider 响应、原始 prompt 或堆栈。
- Phase 5 Lesson Provider 取消语义：
  - Contracts / Main / Preload：新增显式 `lessons:cancel-run` channel 和 `window.deepstorming.lessons.cancelRun(operationId)`；reply/retry 请求携带 `operationId`，不暴露泛用 invoke。
  - Application：新增 `LessonRunOperations` 与 `CancelLessonRun`，为正在执行的 lesson reply/retry 注册取消 token；取消完成后清理内存 registry。
  - Provider 接线：`LessonTutorReplyGeneratorPort` 接收 `CancellationToken`，`ProviderLessonTutorReplyGenerator` 将同一个 token 传给 Mock/OpenAI-compatible gateway。
  - 持久化语义：取消时保留已保存的 learner message（reply 场景）和 started run，并把同一 run 更新为 `cancelled`、`outputMessageId=null`、`errorSummary.code=OPERATION_CANCELLED`。
  - Renderer：提交回答和重试生成 pending 时显示“取消生成/取消重试”，取消成功后显示“生成已取消。”；failed/cancelled run 仍保留重试入口。
  - 当前限制：取消 registry 是进程内状态；应用重启后只能重试已持久化的 failed/cancelled run，不恢复 in-flight 外部请求。
- 剩余软件设计收敛：
  - `docs/planning/software-design-completion-roadmap.md` 已整理 D1-D8 设计队列：真实云 Provider 验收、PDF 文档底座、阅读器与证据定位、chunk/检索/上下文预算、TutorAction 状态机、费曼评价与复习、论文工作流、发布候选。
  - `docs/planning/provider-cloud-release-acceptance.md` 已补 DeepSeek / OpenAI-compatible 真实云 Provider 手动验收矩阵、发布前清单、隐私说明和敏感信息扫描建议。
  - `docs/superpowers/specs/2026-07-12-pdf-document-foundation-design.md` 已补 PDF 文档底座设计。
  - `docs/superpowers/plans/2026-07-12-pdf-document-foundation.md` 已补 PDF 文档底座实施计划。
- Phase 6 PDF 文档底座启动：
  - Domain：新增 PDF import job 状态枚举、`DocumentImportJob`、安全错误摘要和 `normalizeDocumentImportJob`，拒绝无效 UUID、hash、source kind、file size 与失败状态缺少错误摘要。
  - Contracts：新增 `documents:import-pdf`、`documents:get-pages`、`documents:get-page-blocks` channel，以及 PDF import job、page、text block 的严格 DTO schema 和结果 envelope。
  - Infrastructure：新增 migration v8 `pdf_document_foundation`，创建 `document_import_jobs`、`document_files`、`document_pages`、`document_text_blocks`；新增 `SqliteDocumentImportRepository`，覆盖 queued/parsing/ready/failed job、页面/文本块持久化和按 document 查询。
  - Application：新增 PDF file store / text extractor ports 与 `ImportPdfDocument` use case；导入状态按 `queued -> copying -> parsing -> ready` 持久化，password protected / no text layer / damaged PDF 会落成 failed job 的安全错误摘要。
  - Desktop：新增 `importPdf/getPages/getPageBlocks` 显式 IPC 与 preload API，文档库 UI 增加 PDF 导入入口、loading、ready 后自动打开详情、failed 安全错误展示；main composition 已接入本地 PDF 文件存储与真实 `PdfParseTextExtractor`。
  - PDF 文本解析：锁定 `pdf-parse@2.4.5`；Infrastructure 通过动态导入和最小 pdf.js geometry globals 避免 Electron main 静态加载失败，Desktop 将 `pdf-parse` 声明为运行时依赖以保证打包/运行路径可解析。
  - Renderer 安全边界：Preload 通过 Electron `webUtils.getPathForFile(file)` 暴露窄文件路径 helper；Renderer 不直接导入 Electron/Node，也不暴露泛用 IPC。
  - E2E：文档/课堂持久化流程新增确定性最小 PDF fixture，覆盖 PDF 导入、详情页面正文、页面/Block 预览、从 PDF 片段启动课堂、重启后 PDF 文档与 page/block 仍可读取。
- Phase 6 D4 Chunk / 检索 / 上下文预算：
  - Application / Infrastructure：课堂首问与 follow-up 已持久化 `inputSummary.contextChunks` 与 `contextCharacterCount`，并在 chunk 缺失时稳定降级为 snippet-only。
  - Renderer：课堂详情的每条生成记录下新增“上下文证据”区块，展示命中的页码范围与字符数；没有 chunk 时明确标注“课堂仍可继续（已降级为 snippet）”。
  - 文档 / 课堂联动：文档库重新允许同一 PDF 证据目标被重复聚焦，支持多次从课堂回到同一 block。
  - E2E：桌面主流程新增 PDF block 课堂首问/追问两轮上下文证据断言，并在重启前清空 `document_chunks` fixture，验证 chunk 缺失后课堂仍可继续。
- Phase 6 D5 TutorAction / LessonState 状态机：
  - Domain / Contracts：新增 `LessonState`、`TutorActionType`、`LessonStep` 与状态转移校验；当前动作集合为 `ask/hint/explain/reflect/summarize`，状态集合覆盖 `opening/probing/hinting/explaining/reflecting/summarizing/completed/paused/error`。
  - Infrastructure：Migration 12 为 `lesson_sessions` 增加 `current_state`，并新增 `lesson_steps`，用 `sequence_no`、`state_before/state_after`、`action_type`、`status`、`model_run_id/message_id`、安全错误摘要记录课堂状态机审计链路。
  - Application：Start / Reply / Retry / Cancel 都会先写入或更新对应 step；成功路径推进到下一状态，失败和取消保留可恢复记录，重试追加新 step 而不覆盖原失败 step。
  - Renderer：课堂详情展示当前阶段中文标签；每条生成记录展示对应教学动作与状态转移，历史会话缺少 step 时显示“状态机记录尚未生成”。
  - E2E：桌面主流程覆盖 PDF block 与搜索片段课堂的 `opening -> probing` 首问、`probing -> probing` follow-up、重启恢复后的状态显示，以及 chunk 缺失降级时状态机记录仍存在。
- Phase 6 D6 Mastery Evidence / Misconception MVP：
  - Domain / Contracts：新增 MasteryEvidence、MisconceptionSignal 领域模型与严格 DTO，课堂会话 DTO 随 session 返回 `masteryEvidence` 与 `misconceptionSignals`。
  - Infrastructure：Migration 13 新增 `lesson_mastery_evidence` 与 `lesson_misconception_signals`，按课堂、step、learner/tutor message 保存诊断证据，并用 `UNIQUE(tutor_message_id)` 防止同一成功追问重复生成证据。
  - Application：`SubmitLessonReply` 和成功 `RetryLessonRun` 通过 deterministic 规则生成学习诊断；普通 teach-back 记录 `partial_understanding` / `55%`，卡住表达记录 `needs_review` 与误区信号，失败或取消不生成诊断。
  - Renderer：课堂详情在生成记录后展示“学习诊断”，包含掌握判断、置信度、安全 rationale、复习建议，以及关联误区信号。
  - E2E：桌面主流程覆盖提交普通回答后的学习诊断展示、重启后诊断持久可见，以及 chunk 缺失降级继续课堂时诊断仍可见。

- Phase 6 D6 Review Scheduler MVP：
- Domain / Contracts：新增 `ReviewItem`、`ReviewEvent`、`ReviewRating`、`ReviewItemStatus`，课堂会话 DTO 随 session 返回 `reviewItems` 与 `reviewEvents`，并新增显式 `lessons:record-review` channel。
- Infrastructure：Migration 14 新增 `lesson_review_items` 与 `lesson_review_events`，按课堂持久化复习任务、复习回答和下一次到期时间。
- Application：成功课堂回答在 `suggestedReview = true` 时自动创建 review item；`RecordReviewEvent` 根据 `remembered` / `forgot` 更新 `dueAt` 为 `+3d` / `+1d` 并追加 review event。
- Desktop：Preload 暴露 `window.deepstorming.lessons.recordReview(...)`；课堂详情在“学习诊断”下方新增“复习任务”，支持回答、保存、错误提示和 due date 刷新。
- 验证：Domain / Contracts / Application / Infrastructure / IPC / Preload / Renderer 测试已覆盖 review loop。
- Phase 6 D7 Paper Lesson Mode MVP：
  - Domain / Contracts：课堂会话新增 `lessonMode='paper'` 与 `paperProfile`，严格校验论文阅读阶段元数据。
  - Application：纸面论文文档默认进入 paper mode；首问/追问切换到论文专用 prompt，并在成功回答后把阶段从 `orientation` 推进到 `problem_framing`。
  - Infrastructure：Migration 15 为 `lesson_sessions` 增加 `lesson_mode` 与 `paper_profile_json`，课堂持久化与重启恢复保留论文阶段。
  - Desktop：PDF 导入文档默认标记为 `documentType='paper'`；课堂详情新增“当前论文阶段”卡片，展示阶段标签与摘要。
  - E2E：新增 paper lesson 启动、阶段推进与重启恢复覆盖，并同步修正 PDF 导入课堂默认进入 paper mode 后的既有断言。
- D1 真实 DeepSeek Provider 手动验收：
  - 真实 key 通过本地安全方式输入，完成创建、启用、连接测试、一次真实课堂生成与重启恢复验证。
  - 本轮通过 `deepseek-v4-flash` 完成真实云 Provider 验收；验收记录已做脱敏，不包含 API Key、Authorization header、原始响应正文或完整 prompt。
- D1 OpenAI-compatible 真实验收状态：
  - 当前缺少可用的真实兼容端点与凭据，因此保持“待真实验收”状态。
  - 这不是本地实现缺陷；后续补充真实 `HTTPS base URL + model + API key` 后，按 `docs/planning/provider-cloud-release-acceptance.md` 的 O-01 ~ O-08 执行即可恢复推进。
  - 在没有真实兼容端点的前提下，不以 mock、单测或文档推断替代真实验收结论。
- D8 自用版发布候选推进：
  - 补充未签名自用版发布说明、隐私/备份/恢复边界。
  - 保留签名、公证和公开分发为后续工作，不把它们作为当前自用版门禁。

## 当前范围与非目标

- 已完成范围：既有文本/PDF 文档、Provider、课堂、诊断、复习和论文模式能力，以及 Stage 1 的 chat-first 工作空间界面基础。
- 当前非目标：OCR、扫描 PDF、严格 AI-only 导师、Markdown/LaTeX 与图像引用渲染、课程结束/记忆/复习分流、聊天导出、自动上下文压缩、embeddings、语义检索、通知/日历提醒和后台导入任务。

## 当前门禁

1. `pnpm check`：通过；Prettier、全 workspace typecheck、测试与桌面端构建全部通过。
2. `pnpm test:e2e`：通过；当前 Stage 1 套件有 2 个开发版 Electron E2E 通过，分别覆盖设置中的 Mock Provider lifecycle，以及 chat-first 文档/课堂完整旅程。主旅程包含粘贴长文本、可选择文本 PDF 导入、紧凑详情、显式打开阅读器、从文档开课、对话回复、信息抽屉和侧栏调宽/收起；packaged persistence 测试在未先执行 `pnpm package:dir` 时按说明跳过。脚本在 Playwright 前重建 Electron ABI，并在结束后恢复 Node ABI。
3. `pnpm package:dir`：通过；Electron 43.1.0 为 arm64 重建原生模块，目录包位于 `apps/desktop/release/mac-arm64/DeepStorming.app`。
4. `pnpm exec playwright test tests/e2e/packaged-provider.spec.ts`：通过；同一临时 `userData` 下，打包 App 第一次创建 `Packaged Tutor`/`mock-success`，第二次启动仍显示该 Provider 与模型名。
5. 原生模块证据：`Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 为 Mach-O 64-bit arm64 bundle；使用该目录包的 Electron runtime 从 `app.asar` 加载模块并完成临时 SQLite 的 create/insert/select，输出 `{"value":"ok"}`。
6. `electron-builder` 会在共享 pnpm workspace 中将原生模块切换为 Electron ABI；跨平台 Node 打包脚本和 E2E 脚本均在 `finally` 中确定性执行 Node ABI 重建（包括打包或测试失败时，并保留原失败退出码），避免打包/E2E 后 Vitest/开发运行失效。

## 已知问题

- 目录包未签名并使用 Electron 默认图标；这不影响本次 SQLite 原生模块门禁，发布前仍需签名与品牌资源。

## 常用命令

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

## 下一步

按照 AI-first workspace redesign 路线继续 Stage 2：先建立严格 AI-only 导师契约和导师/伙伴设置，再依次推进富对话渲染与引用/图像管线、完整课程生命周期与导出、上下文压缩与 token 预算。旧 D1–D8 路线保留为既有能力与发布基线，不代表这些新阶段已经完成。
