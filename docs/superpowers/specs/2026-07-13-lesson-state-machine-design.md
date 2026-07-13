# D5：TutorAction / LessonState 最小状态机设计

## 目标

把当前“导师追问字符串”升级为可解释、可恢复、可测试的课堂状态机。D5.1 的目标不是一次性实现完整教学心理学流程，而是先建立稳定骨架：应用层拥有状态、合法迁移、动作审计和恢复语义；模型或本地生成器只提出可校验的 `TutorAction` 候选。

本阶段完成后，课堂首问、学习者回答后的追问、失败、取消、重试和重启恢复都应落在同一套 `LessonState + TutorAction + LessonStep` 结构上。

## 非目标

- 不实现完整产品蓝图中的全部状态：`PRECHECK`、`TRANSFER_CHALLENGE`、`MASTERY_DECISION` 等留到 D6/D7 前后扩展。
- 不实现 embedding、语义检索、中文分词或新的检索策略；D5 直接消费 D4 的 budgeted chunk context。
- 不要求真实云 Provider 在本阶段输出严格 JSON。OpenAI-compatible Gateway 可以继续返回文本，由应用包装为可校验的 `TutorAction`。
- 不实现完整费曼评分、误区库、复习任务和长期掌握度回写；这些进入 D6。
- 不实现流式输出。当前仍以非流式最终结果写库。

## 设计原则

### 1. 应用层拥有状态机

ADR-0005 已确定：模型不能直接决定数据库写入或任意跳转状态。D5.1 延续这个边界：

- Domain 定义 `LessonState`、`TutorActionType`、`LessonStep` 和合法迁移。
- Application 在 use case 中创建 step、调用 generator、校验 action、保存事务。
- Infrastructure 只负责持久化，不包含教学规则。
- Renderer 只展示状态与动作，不计算下一状态。

### 2. 先做最小闭环

D5.1 使用 8 个状态：

- `opening`：课堂启动后提出首问。
- `probing`：默认苏格拉底追问状态。
- `hinting`：用户卡住或回答不足时给提示。
- `explaining`：提示后仍卡住时给短讲解。
- `reflecting`：要求用户复述、解释或总结理解。
- `summarizing`：生成本轮小结。
- `completed`：课堂完成。
- `paused`：用户暂停。
- `error`：可恢复错误态。

首版课堂启动从 `opening` 成功进入 `probing`。学习者提交回答时，默认保持 `probing -> probing`；当用户明确表达“不会 / 不懂 / 卡住”时进入 `probing -> hinting`；提示后仍卡住可进入 `hinting -> explaining`；用户请求总结或复述时可进入 `reflecting` 或 `summarizing`。`completed`、`paused`、`error` 先作为模型和数据结构允许的终态/恢复态，不要求 D5.1 暴露所有 UI 操作。

### 3. TutorAction 是结构化导师动作

每次导师输出都由结构化动作表示：

```ts
type TutorActionType = 'ask' | 'hint' | 'explain' | 'reflect' | 'summarize'

type TutorAction = Readonly<{
  actionType: TutorActionType
  stateBefore: LessonState
  stateAfter: LessonState
  utterance: string
  citedChunkIds: readonly string[]
  rationale: string
}>
```

字段语义：

- `actionType`：本轮教学动作。
- `stateBefore` / `stateAfter`：必须通过 Domain 状态机校验。
- `utterance`：写入现有 tutor message。
- `citedChunkIds`：引用 D4 选中的 context chunks；snippet-only 降级时允许为空。
- `rationale`：短审计说明，用于调试和未来 Review，不在普通课堂 UI 中突出展示。

### 4. LessonStep 记录状态迁移

新增 `LessonStep` 审计记录，每个导师动作对应一个 step：

```ts
type LessonStepStatus = 'started' | 'succeeded' | 'failed' | 'cancelled'

type LessonStep = Readonly<{
  id: string
  lessonId: string
  sequenceNo: number
  stateBefore: LessonState
  stateAfter: LessonState
  actionType: TutorActionType
  status: LessonStepStatus
  modelRunId: string
  messageId: string | null
  rationale: string | null
  errorSummary: LessonRunErrorSummary | null
  createdAt: string
  finishedAt: string | null
}>
```

恢复语义：

- `lesson_sessions.currentState` 保存最后一个成功 step 的 `stateAfter`。
- `started / failed / cancelled` step 不推进 `currentState`。
- 重试不覆盖旧 step；追加新的 step 和 run，保留审计链路。
- 应用重启后直接读取 `currentState` 和 step 列表，不从消息文本反推状态。

## 数据模型与迁移

### 1. 扩展 `lesson_sessions`

新增字段：

- `current_state TEXT NOT NULL DEFAULT 'opening'`

历史 session 升级时默认 `opening`，随后首个新动作会推进到实际状态。为避免破坏已有数据，读取历史 lesson 时如果缺少 steps，UI 可显示“状态机记录尚未生成”或仅显示 `currentState`。

### 2. 新增 `lesson_steps`

建议 migration：

```sql
CREATE TABLE lesson_steps (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
  state_before TEXT NOT NULL,
  state_after TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'cancelled')),
  model_run_id TEXT NOT NULL REFERENCES lesson_model_runs(id) ON DELETE CASCADE,
  message_id TEXT NULL REFERENCES lesson_messages(id) ON DELETE SET NULL,
  rationale TEXT NULL,
  error_summary_json TEXT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT NULL,
  UNIQUE(lesson_id, sequence_no)
);

CREATE INDEX lesson_steps_lesson_id_sequence_no_idx
  ON lesson_steps(lesson_id, sequence_no);

CREATE INDEX lesson_steps_model_run_id_idx
  ON lesson_steps(model_run_id);
```

字段约束：

- `action_type` 只允许 `ask/hint/explain/reflect/summarize`。
- `state_before/state_after` 只允许 D5.1 的状态集合。
- `status = 'failed'` 或 `cancelled` 时允许 `error_summary_json`；成功 step 应保持 `null`。

## Use case 集成

### 1. `StartLessonFromDocument`

流程：

1. 创建 lesson session，`currentState = opening`。
2. 组装 D4 context。
3. 创建 `lesson_tutor_first_question` model run。
4. 创建 `started` lesson step：`opening -> probing`，`actionType = ask`。
5. generator 返回 `TutorAction`。
6. Domain 校验 action 与 step 一致。
7. 保存 tutor message、将 model run 和 step 标记 `succeeded`，并更新 session `currentState = probing`。

若 generator 失败，本阶段保持现有首问本地 fallback 语义；若未来首问也可能失败，则保存 failed run / failed step，session 保持 `opening`。

### 2. `SubmitLessonReply`

流程：

1. 保存 learner message。
2. 读取 session 当前状态。
3. 组装 D4 context。
4. 创建 `started` follow-up model run。
5. 根据 learner reply 和当前状态选择候选目标：
   - 默认：`probing -> probing`，`actionType = ask`。
   - 表达卡住：`probing -> hinting` 或 `hinting -> explaining`。
   - 请求总结：`probing/hinting/explaining -> summarizing`。
   - 请求复述：进入 `reflecting`。
6. 创建 `started` step。
7. generator 返回 `TutorAction`，Domain 校验合法迁移。
8. 成功时保存 tutor message，run/step 置为 `succeeded`，更新 `currentState`。
9. 失败时保留 learner message、failed run 和 failed step，`currentState` 不推进。

### 3. `RetryLessonRun`

重试失败或取消的 run 时：

- 不修改原 run / step。
- 基于 session 当前 `currentState` 创建新的 run / step。
- 成功后追加 tutor message 并推进状态。
- 如果原失败 run 对应的 learner reply 已保存，重试继续引用该课堂上下文，不重复写 learner message。

### 4. `CancelLessonRun`

取消 reply/retry 时：

- 保留已写入的 learner message。
- 对当前 started run 写 `cancelled`。
- 对当前 started step 写 `cancelled`。
- `currentState` 回到最后一个 succeeded step 的 `stateAfter`，即取消不推进状态。

## Provider / Generator 策略

新增或扩展 `LessonTutorReplyGeneratorPort`，让它返回 `TutorAction` 候选，而不是裸字符串。

首版兼容策略：

- Mock generator：直接返回 deterministic `TutorAction`，用于单元测试和本地 fallback。
- OpenAI-compatible generator：继续请求非流式 Chat Completions，得到文本后由 Application 包装为候选 action；包装时使用 use case 已决定的 `stateBefore/stateAfter/actionType`，并把 provider 文本作为 `utterance`。
- 后续 D5.2：Prompt 要求 Provider 输出 JSON schema，再由 Contracts/Domain 验证模型候选。

这个策略让状态机先稳定落地，同时不阻塞真实 Provider 路径。

## Renderer 体验

课堂页增加轻量状态机信息：

- 会话顶部显示当前阶段，例如：`当前阶段：苏格拉底追问`。
- 生成记录下显示动作类型和状态变化，例如：`动作：ask · opening → probing`。
- 保留现有上下文证据、错误摘要、重试和取消入口。

阶段中文映射：

- `opening`：开场提问
- `probing`：苏格拉底追问
- `hinting`：提示阶梯
- `explaining`：短讲解
- `reflecting`：复述反思
- `summarizing`：阶段小结
- `completed`：已完成
- `paused`：已暂停
- `error`：待恢复

## 错误处理与恢复

- 非法状态迁移在 Domain 层拒绝，Application 映射为稳定 `LessonUseCaseError`。
- Provider 失败时保存 failed run / failed step，错误摘要不得包含 API Key、Authorization header、原始响应正文或堆栈。
- 取消时保存 cancelled run / cancelled step，不推进 `currentState`。
- 重试追加新记录，不覆盖旧失败记录。
- 读取历史 session 时，缺少 steps 不能导致课堂不可打开。

## 测试策略

### Domain

- 状态枚举和动作类型规范化。
- 合法迁移通过：`opening -> probing`、`probing -> probing`、`probing -> hinting`、`hinting -> explaining`、`probing -> summarizing`。
- 非法迁移失败：`completed -> probing`、`opening -> completed`、`error -> completed`。
- `TutorAction` 拒绝空 utterance、非法 action type、非法 cited chunk id。

### Infrastructure

- Migration 新增 `lesson_sessions.current_state` 和 `lesson_steps`。
- Repository 能保存、读取 step，并按 `sequenceNo` 排序。
- `save(session)` 能事务性保存 session currentState、messages、modelRuns、steps。
- 历史 session 无 step 时仍可读取。

### Application

- 首问创建 `opening -> probing` succeeded step。
- follow-up 默认创建 `probing -> probing` step。
- learner 表达卡住时进入 hinting 或 explaining。
- Provider 失败保留 failed step，不推进 `currentState`。
- 取消保留 cancelled step，不推进 `currentState`。
- 重试追加新 step，不覆盖旧 step。

### Renderer

- 显示当前阶段。
- 显示每个 run 对应的 action type 和状态迁移。
- 历史 session 无 step 时不崩溃。

### E2E

- 从 PDF block 开课后显示 `当前阶段：苏格拉底追问`。
- 首条生成记录显示 `动作：ask · opening → probing`。
- 提交学习者回答后 follow-up 显示 `动作：ask · probing → probing` 或 hinting 迁移。
- 重启后仍显示 current state 和 step 记录。

## 实施切片

1. Domain / Contracts：新增状态机类型、校验和 DTO。
2. Infrastructure：新增 migration 和 lesson step 持久化。
3. Application：把 Start / Reply / Retry / Cancel 接入 step 状态机。
4. Main / Preload：如果现有 lesson DTO 足够，只更新 contracts；不新增泛用 IPC。
5. Renderer：展示 current state 和 step/run 动作信息。
6. E2E / Docs：覆盖 PDF 课堂主流程和重启恢复，更新当前状态文档。

## 取舍

- 先包装 Provider 文本为 `TutorAction`，牺牲一部分“模型主动提出教学动作”的理想形态，换取状态机先稳定落地。
- `paused/completed/error` 进入类型系统，但 D5.1 不强制暴露所有操作，避免 scope 膨胀。
- 当前 hint/explain 判断使用简单 deterministic 规则，未来可由 D6 的诊断/评分系统替代。
