# Phase 5 课堂最小会话进度

- 更新时间：2026-07-12
- 范围：从文档详情或搜索结果启动本地 `LessonSession`，生成首条本地 Mock Tutor 提问，记录 Prompt / Model Run，并支持学习者回复触发下一轮本地追问
- 状态：课堂会话、消息基础、生成记录与本地多轮闭环已完成并通过开发版门禁

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

## 当前非目标

- 不调用真实 Provider。
- 不做流式输出。
- 不落地 TutorAction / LessonState 完整状态机。
- 不调用真实 Provider，不保存真实 Provider 请求/响应、token 统计、评价、复习任务。
- 不做 PDF 页码、坐标或高亮。

## 已验证命令

- `pnpm vitest run packages/application/src/lesson-use-cases.test.ts packages/contracts/src/lesson.test.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx packages/contracts/src/provider.test.ts`：130 通过。
- `pnpm test:e2e`：2 通过，1 跳过；覆盖首条 Mock Tutor 提问、生成记录、学习者回复和下一轮追问在创建后与重启后可见。
- `pnpm check`：Prettier、typecheck、37 个测试文件 / 414 个测试、桌面端构建全部通过。

## 下一步建议

1. 引入真实 Provider 调用前的取消/失败运行状态 UI。
2. 增加本地重试入口和稳定错误映射。
3. 把来源 anchor 从文本 offset 扩展到 PDF page/block/chunk。
