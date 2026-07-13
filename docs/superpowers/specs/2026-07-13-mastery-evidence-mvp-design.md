# D6：Mastery Evidence / Misconception / Review MVP 设计

- 日期：2026-07-13
- 状态：已确认设计，待实施计划
- 上游依赖：D5 TutorAction / LessonState 状态机

## 1. 目标

D6-MVP 的目标是把课堂中的学习者回答转化为可持久化、可恢复、可展示的学习诊断证据。它不是完整评分系统，也不尝试一次性完成复习调度；这一刀只建立最小可信闭环：

1. 学习者提交回答。
2. 导师生成 follow-up 成功。
3. Application 根据学习者回答和课堂状态生成一条 `MasteryEvidence`。
4. 如果回答暴露“卡住/不懂/不会”等信号，同时生成一条 `MisconceptionSignal`。
5. 课堂页显示“学习诊断”，重启后仍可读取。

这让 DeepStorming 从“能追问”进入“能记录理解状态”的阶段，并为后续 ReviewItem / ReviewEvent / 调度算法打地基。

## 2. 非目标

本阶段明确不做：

- 不做 Provider 结构化 JSON 评分。
- 不做复杂 rubric、分数曲线、知识图谱或长期掌握度合并。
- 不做复习任务列表、日程、间隔重复算法或通知。
- 不把完整 prompt、Provider 原始响应、Authorization header、API Key、堆栈或未脱敏错误写入数据库。
- 不改变 D5 的 lesson state machine 迁移语义；D6 只消费已存在的 lesson/message/step/run。

## 3. Domain 模型

新增两个领域模型。

```ts
type MasteryEvidenceKind = 'teach_back' | 'stuck_signal' | 'self_report'

type MasteryJudgement = 'insufficient' | 'partial_understanding' | 'needs_review'

type MasteryEvidence = Readonly<{
  id: string
  lessonId: string
  stepId: string
  learnerMessageId: string
  tutorMessageId: string
  kind: MasteryEvidenceKind
  judgement: MasteryJudgement
  confidence: number
  rationale: string
  suggestedReview: boolean
  createdAt: string
}>

type MisconceptionSignal = Readonly<{
  id: string
  evidenceId: string
  lessonId: string
  label: string
  severity: 'low' | 'medium' | 'high'
  rationale: string
  createdAt: string
}>
```

约束：

- 所有 ID 必须是 UUID。
- `confidence` 必须在 `[0, 1]`。
- `rationale` 必须是短文本，最大 280 字符。
- `label` 是用户安全短标签，最大 80 字符。
- `MisconceptionSignal.evidenceId` 必须指向一条 mastery evidence。

## 4. Deterministic 诊断规则

D6-MVP 不依赖模型评分，先使用 deterministic classifier，保证可测试、离线可用、不会引入 Provider 结构化输出不稳定性。

输入：

- `learnerReply`
- 当前 lesson step
- 成功生成的 tutor message

规则：

1. 空白回答仍由现有 reply draft 校验拦截，不生成 evidence。
2. 回答包含卡住词：`不会`、`不懂`、`不知道`、`卡住`、`help`、`stuck`、`confused`
   - `kind = 'stuck_signal'`
   - `judgement = 'needs_review'`
   - `confidence = 0.75`
   - `suggestedReview = true`
   - 生成 `MisconceptionSignal`，`label = '学习者表达卡住'`，`severity = 'medium'`
3. 去空白后长度小于 12 字符
   - `kind = 'teach_back'`
   - `judgement = 'insufficient'`
   - `confidence = 0.65`
   - `suggestedReview = true`
   - 不生成 misconception signal
4. 其他回答
   - `kind = 'teach_back'`
   - `judgement = 'partial_understanding'`
   - `confidence = 0.55`
   - `suggestedReview = false`
   - 不生成 misconception signal

失败和取消：

- Provider/generator 失败时不生成 mastery evidence。
- 取消时不生成 mastery evidence。
- Retry 成功时可以基于原 learner message 生成新的 mastery evidence，但必须通过唯一约束避免同一个 successful tutor message 重复生成 evidence。

## 5. Application 边界

`SubmitLessonReply` 成功路径在保存 tutor message、model run 和 lesson step 后生成 mastery evidence。

`RetryLessonRun` 成功路径如果能定位到原 learner message，也生成 mastery evidence。这样当第一次 follow-up 失败后用户点击重试，成功的 retry 仍能留下学习诊断。

新增 helper：

- `classifyMasteryEvidence(input)`：纯函数，返回 evidence draft 与可选 misconception signal draft。
- `nextEvidenceSequence(session)` 不需要暴露到 Domain；SQLite 用唯一 ID 与外键表达顺序，UI 按 `createdAt` 排序。

Repository 接口扩展：

```ts
type StoredLessonSession = Readonly<{
  // existing fields
  masteryEvidence: readonly StoredMasteryEvidence[]
  misconceptionSignals: readonly StoredMisconceptionSignal[]
}>
```

## 6. SQLite 持久化

新增 Migration 13：`lesson_mastery_evidence`。

### `lesson_mastery_evidence`

字段：

- `id TEXT PRIMARY KEY`
- `lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE`
- `step_id TEXT NOT NULL REFERENCES lesson_steps(id) ON DELETE CASCADE`
- `learner_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE`
- `tutor_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE`
- `kind TEXT NOT NULL CHECK (...)`
- `judgement TEXT NOT NULL CHECK (...)`
- `confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1)`
- `rationale TEXT NOT NULL`
- `suggested_review INTEGER NOT NULL CHECK (suggested_review IN (0,1))`
- `created_at TEXT NOT NULL`

约束与索引：

- `UNIQUE(tutor_message_id)`：同一条成功 tutor message 只生成一条 mastery evidence。
- `lesson_mastery_evidence_lesson_created`：`(lesson_id, created_at)`。
- `lesson_mastery_evidence_step`：`step_id`。

### `lesson_misconception_signals`

字段：

- `id TEXT PRIMARY KEY`
- `evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE`
- `lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE`
- `label TEXT NOT NULL`
- `severity TEXT NOT NULL CHECK (severity IN ('low','medium','high'))`
- `rationale TEXT NOT NULL`
- `created_at TEXT NOT NULL`

约束与索引：

- `UNIQUE(evidence_id, label)`。
- `lesson_misconception_signals_lesson_created`：`(lesson_id, created_at)`。

## 7. Contracts / IPC

`LessonSessionDto` 增加：

```ts
masteryEvidence: LessonMasteryEvidenceDto[]
misconceptionSignals: LessonMisconceptionSignalDto[]
```

D6-MVP 不新增 IPC channel。现有：

- `lessons:list`
- `lessons:get`
- `lessons:reply`
- `lessons:retry-run`

都会随 session DTO 返回诊断数据。

## 8. Renderer

课堂详情新增“学习诊断”区块，位于“生成记录”之后、“你的回答”之前。

展示规则：

- 无 evidence：显示“还没有学习诊断。”
- 有 evidence：显示最新一条：
  - 判断中文标签：
    - `insufficient` → “证据不足”
    - `partial_understanding` → “部分理解”
    - `needs_review` → “建议复习”
  - `confidence` 百分比。
  - `rationale`。
  - 如果 `suggestedReview = true`，显示“建议加入后续复习”。
- 如果存在关联 misconception signal，显示 label、severity 和 rationale。

Renderer 继续只依赖 Contracts，不导入 Application / Infrastructure / SQLite。

## 9. 测试策略

必须覆盖：

1. Domain normalizer：
   - confidence 边界。
   - 空 rationale 拒绝。
   - invalid judgement/kind 拒绝。
2. Contracts schema：
   - lesson session DTO 必须包含 mastery evidence 与 misconception signals。
3. Application：
   - 正常回答生成 `partial_understanding`。
   - 短回答生成 `insufficient` 且 suggestedReview。
   - 卡住回答生成 `needs_review` 与 misconception signal。
   - Provider 失败/取消不生成 evidence。
   - Retry 成功基于原 learner message 生成 evidence。
4. Infrastructure：
   - Migration 13 创建两张表和索引。
   - Repository 保存、读取、重写 session 时保留 evidence 和 signal。
   - `UNIQUE(tutor_message_id)` 防止重复 evidence。
5. Renderer：
   - 显示学习诊断。
   - 显示 misconception signal。
   - 历史 session 无 evidence 时显示 fallback。
6. E2E：
   - 用户提交回答后课堂页显示学习诊断。
   - 重启后学习诊断仍可见。

## 10. 文档更新

实施完成后更新：

- `docs/planning/current-status.md`
- `docs/planning/software-design-completion-roadmap.md`
- `docs/database/database_schema.md`

当前阶段从 D5 更新为 D6-MVP，下一步保留为 ReviewItem / ReviewEvent / 调度或 D7 论文工作流。

## 11. 风险与取舍

- Deterministic 诊断较粗糙，但可测试、可离线、不会引入 Provider 输出格式不稳定；后续可以替换为结构化模型诊断。
- 不做 ReviewItem 会让“建议复习”暂时停留在课堂页提示，但这能避免过早设计复习系统。
- Retry 成功生成 evidence 需要谨慎定位原 learner message；若无法定位，应跳过 evidence，而不是猜测并写入错误关联。
