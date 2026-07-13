# D6：ReviewItem / ReviewEvent / Scheduler MVP 设计

- 日期：2026-07-13
- 状态：已选择方案 A，待实施计划
- 上游依赖：D6-MVP Mastery Evidence / Misconception

## 1. 目标

D6 Review MVP 的目标是把已经生成的学习诊断转化为可执行的复习任务。当前系统已经能在课堂回答后生成 `MasteryEvidence` 和可选 `MisconceptionSignal`；本阶段在此基础上补齐：

1. 当 mastery evidence 标记 `suggestedReview = true` 时自动创建 `ReviewItem`。
2. 课堂页能展示该课堂相关的待复习项。
3. 用户可以在课堂页标记一次复习结果，生成 `ReviewEvent`。
4. 简单 scheduler 根据复习结果更新下一次到期时间。

这是一刀最小复习闭环：不做通知、不做独立复习中心、不做复杂 SM-2 算法，但让“建议加入后续复习”从提示变成可持久化任务。

## 2. 非目标

本阶段明确不做：

- 不做系统通知、日历集成或后台提醒。
- 不做独立“复习中心”全局页面；先在课堂详情内显示相关复习项。
- 不做复杂间隔重复算法、记忆曲线或概念图谱聚合。
- 不做 Provider 评分或模型生成复习卡片；复习 prompt 来自课堂证据和 deterministic rationale。
- 不改 Provider、文档导入、PDF 阅读器或 D5 状态机语义。

## 3. Domain 模型

新增两个领域模型。

```ts
type ReviewItemStatus = 'active' | 'completed' | 'suspended'
type ReviewRating = 'remembered' | 'forgot'

type ReviewItem = Readonly<{
  id: string
  lessonId: string
  masteryEvidenceId: string
  misconceptionSignalId: string | null
  prompt: string
  answerOutline: readonly string[]
  status: ReviewItemStatus
  dueAt: string
  createdAt: string
  updatedAt: string
}>

type ReviewEvent = Readonly<{
  id: string
  reviewItemId: string
  lessonId: string
  rating: ReviewRating
  response: string
  previousDueAt: string
  nextDueAt: string | null
  reviewedAt: string
  createdAt: string
}>
```

约束：

- 所有 ID 必须是 UUID。
- `prompt`、`response` 必须是非空安全文本。
- `answerOutline` 至少 1 条，每条非空，最多 5 条。
- `status = 'completed'` 时 `dueAt` 仍保留最近一次到期时间，方便审计；是否再次复习由下一条 event 的 `nextDueAt` 决定。
- `rating = 'forgot'` 表示 1 天后再复习；`remembered` 表示 3 天后再复习。

## 4. Scheduler 规则

初版 scheduler 是 deterministic 纯函数，Application 直接调用。

### 创建 ReviewItem

只在 `MasteryEvidence.suggestedReview = true` 时创建。

初始 `dueAt`：

- `judgement = 'needs_review'`：`createdAt + 1 day`
- `judgement = 'insufficient'`：`createdAt + 1 day`
- `partial_understanding`：不自动创建 ReviewItem

初始 prompt：

- 如果有关联 misconception signal：`复习：{signal.label}。请重新解释这段证据想说明什么。`
- 否则：`复习：请重新解释这段课堂证据，并说明你的判断依据。`

answer outline：

- evidence.rationale
- 如果有 misconception signal，则追加 signal.rationale

去重规则：

- `UNIQUE(mastery_evidence_id)`：同一条 evidence 只创建一个 review item。

### 记录 ReviewEvent

用户在课堂页对 ReviewItem 点击：

- “记住了” → `rating = 'remembered'`
- “忘了/还不稳” → `rating = 'forgot'`

调度：

- remembered：`nextDueAt = reviewedAt + 3 days`
- forgot：`nextDueAt = reviewedAt + 1 day`

MVP 中 ReviewItem 不自动变为永久 completed。每次 review event 后：

- `status` 保持 `active`
- `dueAt` 更新为 `nextDueAt`
- `updatedAt = reviewedAt`

这保留最小循环，不引入 retired/completed 策略。

## 5. Application 边界

扩展现有 lesson aggregate：

```ts
type StoredLessonSession = Readonly<{
  // existing fields
  reviewItems: readonly StoredReviewItem[]
  reviewEvents: readonly StoredReviewEvent[]
}>
```

新增用例：

```ts
class RecordReviewEvent {
  execute(input: {
    lessonId: string
    reviewItemId: string
    rating: ReviewRating
    response: string
  }): Promise<LessonSessionView>
}
```

现有用例扩展：

- `SubmitLessonReply` 成功生成 mastery evidence 后，如果 `suggestedReview = true`，同步创建 ReviewItem。
- `RetryLessonRun` 成功生成 mastery evidence 后同样创建 ReviewItem。
- 失败/取消不生成 mastery evidence，因此也不生成 ReviewItem。

错误语义：

- ReviewItem 不存在或不属于 lesson：`LESSON_NOT_FOUND` 或稳定业务错误 `REVIEW_ITEM_NOT_FOUND`。实施时优先复用现有 lesson error 映射模式；如新增 code，需要同步 Contracts。
- response 为空：沿用 required text 校验。

## 6. SQLite 持久化

新增 Migration 14：`lesson_review_items`。

### `lesson_review_items`

字段：

- `id TEXT PRIMARY KEY`
- `lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE`
- `mastery_evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE`
- `misconception_signal_id TEXT REFERENCES lesson_misconception_signals(id) ON DELETE SET NULL`
- `prompt TEXT NOT NULL`
- `answer_outline_json TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('active','completed','suspended'))`
- `due_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `UNIQUE(mastery_evidence_id)`

索引：

- `lesson_review_items_lesson_due`：`(lesson_id, status, due_at)`
- `lesson_review_items_due`：`(status, due_at)`

### `lesson_review_events`

字段：

- `id TEXT PRIMARY KEY`
- `review_item_id TEXT NOT NULL REFERENCES lesson_review_items(id) ON DELETE CASCADE`
- `lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE`
- `rating TEXT NOT NULL CHECK (rating IN ('remembered','forgot'))`
- `response TEXT NOT NULL`
- `previous_due_at TEXT NOT NULL`
- `next_due_at TEXT`
- `reviewed_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`

索引：

- `lesson_review_events_item_reviewed`：`(review_item_id, reviewed_at)`
- `lesson_review_events_lesson_reviewed`：`(lesson_id, reviewed_at)`

## 7. Contracts / IPC

扩展 `LessonSessionDto`：

```ts
reviewItems: LessonReviewItemDto[]
reviewEvents: LessonReviewEventDto[]
```

新增 IPC channel：

- `lessons:record-review`

Preload API：

```ts
window.deepstorming.lessons.recordReview({
  lessonId,
  reviewItemId,
  rating,
  response,
})
```

返回：

- 成功：更新后的 `LessonSessionDto`
- 失败：稳定 `AppResult` error envelope

## 8. Renderer

课堂详情在“学习诊断”下方新增“复习任务”区块。

展示：

- 无 review item：`还没有复习任务。`
- 有 active item：
  - prompt
  - dueAt 简短文案：`下次复习：YYYY-MM-DD`
  - answer outline 折叠或简短列表；MVP 可直接显示要点
  - 文本框：`这次复习回答`
  - 按钮：`记住了`、`还不稳`

交互：

- 提交 remembered / forgot 时显示 loading。
- 成功后刷新 session，显示新的 dueAt，并显示 `复习记录已保存。`
- 失败显示稳定错误消息，保留输入。

取消：

- 记录 review event 是本地快速写入，不需要取消按钮。

## 9. 测试策略

必须覆盖：

1. Domain：
   - ReviewItem / ReviewEvent normalizer。
   - rating/status 枚举。
   - answerOutline 非空。
2. Contracts：
   - review DTO schema。
   - `lessons:record-review` 请求/响应。
3. Application：
   - suggestedReview evidence 自动创建 ReviewItem。
   - partial_understanding 不创建 ReviewItem。
   - record remembered 更新 dueAt 为 +3 天并追加 ReviewEvent。
   - record forgot 更新 dueAt 为 +1 天。
4. Infrastructure：
   - Migration 14 创建两张表和索引。
   - Repository 保存、读取、重写 review items/events。
5. Main / Preload：
   - 显式 IPC handler 和 preload API。
   - 不暴露 generic invoke。
6. Renderer：
   - 显示复习任务 fallback。
   - 显示 prompt/dueAt/outline。
   - 点击 remembered / forgot 调用 preload API 并显示成功。
7. E2E：
   - 提交卡住或短回答后生成学习诊断和复习任务。
   - 点击“记住了”后记录事件，dueAt 更新。
   - 重启后复习任务和事件仍可见。

## 10. 文档更新

实施完成后更新：

- `docs/planning/current-status.md`
- `docs/planning/software-design-completion-roadmap.md`
- `docs/database/database_schema.md`

当前阶段从 D6-MVP 进入 D6 Review MVP；下一步可进入 D7 论文工作流或继续增强复习中心。

## 11. 风险与取舍

- 课堂页内复习任务不是最终 UX，但比先做全局复习中心更小、更容易验证。
- 简单 scheduler 不够智能，但可测试且足以闭环。
- ReviewItem prompt 由 deterministic 文案生成，后续可以升级为 Provider 结构化输出。
- 本阶段会新增一个 IPC channel；需要保持 Main handler “校验 → 单用例 → 错误映射”的边界。
