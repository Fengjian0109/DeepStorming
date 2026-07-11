# Phase 5 课堂最小会话进度

- 更新时间：2026-07-12
- 范围：从文档详情或搜索结果启动本地 `LessonSession`，生成首条本地 Mock Tutor 提问，记录 Prompt / Model Run，支持学习者回复触发下一轮本地追问，并为 failed/cancelled run 提供本地重试入口
- 状态：课堂会话、消息基础、生成记录、本地多轮闭环与运行恢复基础已完成并通过开发版门禁

## 本轮落地内容

- Domain：新增 `LessonSession`、`LessonSourceAnchor`、`LessonStartDraft` 与输入规范化。
- Application：新增 `StartLessonFromDocument`、`GetLessonSession`、`ListLessonSessions`，并验证来源文档仍存在。
- Infrastructure：Migration 3 `lesson_session_foundation`，新增 `lesson_sessions` 与 `lesson_source_anchors`。
- Contracts：新增显式 lesson IPC channels、请求/响应 schema、lesson 业务错误码。
- Main / Preload：新增 `window.deepstorming.lessons` typed API。
- Renderer：启用“课堂”导航，文档详情和搜索结果可创建本地课堂，会话详情显示来源片段。
- E2E：文档导入流程将覆盖从搜索结果启动课堂、重启后课堂持久化。

## 课堂消息基础增量

- Domain：新增 `LessonMessage` 与 `system/tutor/learner` 角色枚举。
- Application：`StartLessonFromDocument` 创建课堂时同步生成首条 `tutor` 消息；首问确定性使用来源标题与选中 snippet，Prompt 版本为 `mock-tutor-v1`。
- Infrastructure：Migration 4 `lesson_message_foundation` 新增 `lesson_messages`，保存 `role`、`content`、`source_anchor_ids_json`、`prompt_version`、`message_index` 和 `created_at`。
- Contracts：`LessonSessionDto` 扩展 `messages`，严格拒绝未知消息角色和额外字段。
- Renderer：课堂详情在来源片段下方展示“导师提问”和 Prompt 版本。
- E2E：从搜索结果启动课堂后断言首条导师提问可见，重启后继续可见。

## Prompt / Model Run 基础增量

- Domain：新增 `LessonModelRun`、`LessonPromptManifest`、脱敏 `LessonModelRunInputSummary` 与 `started/succeeded/failed/cancelled` 状态枚举。
- Application：首条 Mock Tutor 提问关联 `modelRunId`；`modelRuns[0]` 记录 `mock-local`、`lesson_tutor_first_question`、`lesson.mockTutor.firstQuestion` v1、模板 hash 和 `succeeded` 状态。
- Infrastructure：Migration 5 `lesson_model_run_foundation` 新增 `lesson_model_runs`，并给 `lesson_messages` 增加可空 `model_run_id`，兼容已有本地课堂消息。
- Contracts：`LessonSessionDto` 扩展 `modelRuns`，严格校验 prompt hash、脱敏输入摘要和运行状态。
- Renderer：课堂详情新增“生成记录”，显示模型名、状态和 Prompt Manifest 版本。
- E2E：从搜索结果启动课堂后断言 `mock-local · succeeded` 可见，重启后继续可见。

## 本地多轮课堂闭环增量

- Contracts / Main / Preload：新增 `lessons:reply` channel 和 `window.deepstorming.lessons.reply({ lessonId, content })`。
- Application：新增 `SubmitLessonReply`；校验非空回答，追加 `learner` 消息，再用 deterministic Mock Tutor 生成 `lesson_tutor_follow_up` 追问。
- Infrastructure：`LessonRepositoryPort` 新增 `save(session)`；SQLite 事务性重写同一课堂 messages/modelRuns；Migration 6 `lesson_follow_up_operation` 允许 `lesson_tutor_follow_up`。
- Renderer：课堂详情新增“你的回答”输入框，提交时展示 loading/success/error，成功后渲染学习者回答和导师追问。
- E2E：覆盖提交回答、下一轮追问、follow-up Prompt Manifest，以及重启后多轮消息仍可读取。

## 课堂运行恢复基础增量

- Domain / Contracts：新增 `LessonRunRetryDraft`、`lessons:retry-run` channel、`retryLessonRunRequestSchema` 和 `LessonRunRetryDraftDto`。
- Application：新增 `RetryLessonRun`；仅允许重试 `failed/cancelled` 的 model run，拒绝 `started/succeeded`，并映射为稳定的 `LESSON_VALIDATION_FAILED`。
- 重试语义：保留原 failed/cancelled run 不变；基于最近一条 learner message 和原 run 的 source anchor 追加新的 deterministic tutor follow-up message，并追加新的 `succeeded` `lesson_tutor_follow_up` run。
- Main / Preload：IPC handler 调用单个 use case，Preload 暴露 `window.deepstorming.lessons.retryRun({ lessonId, modelRunId })`，不暴露泛用 invoke。
- Renderer：生成记录展示原始状态；`failed/cancelled` run 显示“重试生成 …”按钮，重试过程覆盖 loading/success/error UI。
- Infrastructure：无新增 migration；复用现有 `lesson_model_runs.status`、`output_message_id` 和 Repository `save(session)` 保存重试后的追加消息/运行记录。

## 当前非目标

- 不调用真实 Provider。
- 不做流式输出。
- 不落地 TutorAction / LessonState 完整状态机。
- 不调用真实 Provider，不保存真实 Provider 请求/响应、token 统计、评价、复习任务。
- 不做 PDF 页码、坐标或高亮。

## 已验证命令

- `pnpm vitest run packages/application/src/lesson-use-cases.test.ts packages/contracts/src/lesson.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`：43 通过。
- `pnpm test:e2e`：2 通过，1 跳过；覆盖首条 Mock Tutor 提问、生成记录、学习者回复和下一轮追问在创建后与重启后可见。
- `pnpm check`：Prettier、typecheck、37 个测试文件 / 419 个测试、桌面端构建全部通过。

## 下一步建议

1. 引入真实 Provider 课堂调用，把 deterministic Mock Tutor run 替换为 Provider Gateway 驱动。
2. 落地真实 `started/succeeded/failed/cancelled` 状态转换、取消语义和 Provider 错误摘要。
3. 把来源 anchor 从文本 offset 扩展到 PDF page/block/chunk。
