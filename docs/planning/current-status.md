# DeepStorming 当前开发状态

- 更新时间：2026-07-12
- 当前分支：`main`
- 当前阶段：Phase 5 Provider 课堂生成接线
- 状态：本地 LessonSession、多轮课堂、生成记录、failed/cancelled run 重试入口、Provider Gateway 成功/失败/取消路径接线，以及安全错误摘要持久化已完成

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

## Phase 5 当前范围与非目标

- 已完成范围：本地纯文本文档库、文本导入、列表/详情/删除、SQLite 持久化、正文搜索、snippet 与字符 offset、本地课堂会话创建/列表/详情/重启持久化、首条 Mock Tutor 提问持久化、Prompt Manifest 与 Model Run 记录、学习者回复、下一轮 Mock Tutor 追问、failed/cancelled 生成记录的本地重试入口、Provider Gateway 的课堂追问生成端口、Lesson reply/retry 的 Provider 成功/失败/取消路径接线、reply/retry 的 `started/failed/cancelled/succeeded` run 持久化，以及安全错误摘要持久化与展示。
- 非目标：PDF/OCR、页面块结构化解析、FTS5/BM25、chunking、embeddings、流式课堂、完整 TutorAction 状态机、论文工作区、后台导入任务。

## 当前门禁

1. `pnpm check`：通过；Prettier、全 workspace typecheck、37 个测试文件 / 436 个测试，以及桌面端构建全部通过。
2. `pnpm test:e2e`：通过；开发版 Provider lifecycle 和文档/课堂重启持久化 2 个 E2E 通过，其中文档 E2E 覆盖正文搜索、从搜索结果启动课堂、首条 Mock Tutor 提问、生成记录、提交学习者回复、下一轮 Mock Tutor 追问，以及重启后课堂来源片段/多轮消息/生成记录仍可读取；packaged persistence 测试在未先执行 `pnpm package:dir` 时按说明跳过。脚本在 Playwright 前重建 Electron ABI，并在结束后恢复 Node ABI。
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

继续执行 `docs/superpowers/plans/2026-07-12-pdf-document-foundation.md` Task 3：SQLite migration 与 PDF import/page/block repository。发布侧继续处理真实云 Provider 手动验收、签名、图标与公证。
