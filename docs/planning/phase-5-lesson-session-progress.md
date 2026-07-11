# Phase 5 课堂最小会话进度

- 更新时间：2026-07-11
- 范围：从文档详情或搜索结果启动本地 `LessonSession`，并生成首条本地 Mock Tutor 提问
- 状态：课堂会话与消息基础已完成并通过开发版门禁

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

## 当前非目标

- 不调用真实 Provider。
- 不做流式输出。
- 不落地 TutorAction / LessonState 完整状态机。
- 不保存学习者回复、评价、复习任务。
- 不做 PDF 页码、坐标或高亮。

## 已验证命令

- `pnpm vitest run packages/domain/src/lesson.test.ts packages/application/src/lesson-use-cases.test.ts packages/contracts/src/lesson.test.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`：57 通过。
- `pnpm test:e2e`：2 通过，1 跳过；覆盖首条 Mock Tutor 提问在创建后和重启后可见。
- `pnpm check`：Prettier、typecheck、37 个测试文件 / 407 个测试、桌面端构建全部通过。

## 下一步建议

1. 引入 Prompt Template 版本和 Model Run 记录。
2. 增加学习者回复与下一轮 Mock Tutor 状态转换。
3. 把来源 anchor 从文本 offset 扩展到 PDF page/block/chunk。
