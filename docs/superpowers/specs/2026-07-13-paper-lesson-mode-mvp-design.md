# D7：Paper Lesson Mode MVP 设计

- 日期：2026-07-13
- 状态：已选择统一阅读底座 + 论文模式差异化，待实施计划
- 上游依赖：D4 Chunk / 检索 / 上下文预算、D5 LessonState 状态机、D6 学习诊断与复习闭环
- 参考材料：用户提供的 Claude 论文导师提示词，仅作为教学行为素材，不作为产品结构硬约束

## 1. 目标

D7 MVP 的目标不是另做一个独立论文聊天器，而是在现有 DeepStorming 阅读与课堂系统上增加 paper-specific learning mode。

现有系统已经具备：

1. `LearningDocument.documentType = 'paper'`。
2. PDF / 文本文档导入、page / block / chunk 事实保存。
3. 从文档证据启动 `LessonSession`。
4. Provider-backed 课堂首问、追问、失败、取消、重试和状态机审计。
5. MasteryEvidence、MisconceptionSignal、ReviewItem / ReviewEvent。

D7 MVP 在这个底座上补齐论文阅读的第一条可用闭环：

1. 用户从论文文档启动“论文课堂”。
2. 首问不再只是普通证据追问，而是围绕论文的研究阅读目标开场：先给出“论文灵魂”式的简短定位，再探测用户背景。
3. 后续追问遵循论文阅读阶段，而不是泛化概念学习阶段。
4. 阶段、引用证据、术语解释、公式/推导意图都进入 prompt 与审计摘要边界。
5. 学习诊断与复习继续复用 D6，不另建学习记忆系统。

## 2. 非目标

本阶段明确不做：

- 不做完整论文知识库和卡片管理器。
- 不新增 Claim / Evidence / Limitation / Method 独立 CRUD 页面。
- 不做 PDF canvas 渲染、公式 OCR、图表视觉理解或多模态论文解析。
- 不要求模型自动抽取完整论文结构树。
- 不做跨论文研究主题图谱、文献综述、引用网络或 bibliography 管理。
- 不把用户提供的 Claude 提示词逐字固化为唯一系统 prompt。

## 3. 设计原则

### 3.1 统一阅读底座

DeepStorming 应保持一套主链路：

```text
Document -> Page / Block / Chunk -> LessonSession -> LessonStep -> MasteryEvidence -> Review
```

`generic`、`textbook`、`paper` 共享这条链路。论文模式只扩展：

- 课堂启动策略。
- 论文阅读阶段。
- Provider prompt manifest。
- 课堂 UI 的阶段标签与论文阅读 lens。

这样后续书籍、教材和论文不会分裂成三套难以维护的系统。

### 3.2 提示词是行为素材，不是数据模型

用户提供的 Claude 提示词体现了很好的论文导师行为：

- 苏格拉底式追问。
- 一次只推进 1-2 个问题。
- 温和纠偏。
- 阶段总结。
- 首次术语标注。
- 原文引用锚定。
- 公式卡与推导分步。
- 图表优先原则。

D7 吸收这些行为，但不把六阶段文案、引用格式和公式格式直接等同于数据库结构。产品结构应服务于可恢复、可测试、可迭代的课堂。

### 3.3 先做可用闭环，再做论文地图

第一版先让用户能真实使用论文课堂：

1. 从 paper document 启动。
2. 得到 paper-aware 首问。
3. 多轮对话能围绕论文阅读阶段推进。
4. 证据、状态、诊断、复习可持久恢复。

Claim / Evidence / Limitation 卡片化很重要，但应作为 D7.2 或 D9 进入，而不是阻塞第一版。

## 4. Paper Reading Stage

新增论文阅读阶段，作为 LessonState 之上的 paper-specific metadata。它不替代 D5 的 `LessonState`，而是补充“论文阅读正在处理什么问题”。

```ts
type PaperReadingStage =
  | 'orientation'
  | 'problem_framing'
  | 'method_intuition'
  | 'method_mechanics'
  | 'evidence_check'
  | 'critical_review'
  | 'transfer'
  | 'synthesis'
```

阶段语义：

- `orientation`：建立论文整体定位，探测用户背景。
- `problem_framing`：理解作者要解决的研究困境。
- `method_intuition`：先用自然语言建立方法直觉。
- `method_mechanics`：处理算法、公式、推导、伪代码。
- `evidence_check`：阅读实验、消融、图表和结果是否支撑主张。
- `critical_review`：审稿人视角质疑假设、局限和反例。
- `transfer`：迁移到新场景、未来研究或改进方向。
- `synthesis`：阶段总结、复盘和后续复习建议。

与 D5 `LessonState` 的关系：

- `LessonState` 表示教学动作状态，例如 `probing`、`hinting`、`explaining`。
- `PaperReadingStage` 表示论文阅读任务阶段。
- 一个 `probing` 状态可以发生在 `problem_framing`、`critical_review` 等不同论文阶段。

## 5. Paper Lesson Mode

### 5.1 启动条件

当 `LearningDocument.documentType = 'paper'` 时，文档详情和 PDF block reader 增加 paper-aware start lesson 行为：

- 默认按钮文案可保持“开始课堂”，但创建的 lesson 带 `lessonMode = 'paper'`。
- 如果同一论文已有 active paper lesson，UI 优先引导打开已有课堂，避免重复会话泛滥。
- 从 block 启动时仍保留 source anchor、page/block target 和 chunk context。

### 5.2 首问策略

Paper lesson 的首条 tutor message 应完成两件事：

1. 用不超过 3 句话给出论文整体定位。
2. 提出 1 个背景探测问题。

示例意图：

```text
我先用三句话概括这篇论文的核心：...

在进入方法细节前，我想先知道：你对这个领域和相关数学基础已经了解多少？
```

这吸收了参考提示词的“论文灵魂 + 背景探底”，但由系统 prompt 表达为策略，不固定成唯一文本。

### 5.3 Follow-up 策略

Follow-up prompt 根据当前 `PaperReadingStage`、用户回答、来源证据和 context chunks 生成导师动作。

共同约束：

- 每轮只提出 1-2 个引导性问题。
- 优先追问用户自己的判断。
- 用户卡住时先给类比或局部提示，不直接大段讲解。
- 每 3-4 轮或阶段切换时生成简短阶段总结。
- 讨论核心主张、纠偏或批判审视时引用文档证据。
- 遇到公式/推导相关请求时，用结构化公式卡或推导步骤引导。

## 6. Domain / Contracts

MVP 推荐最小扩展 `LessonSession`，不新增独立 Paper aggregate。

```ts
type LessonMode = 'standard' | 'paper'

type PaperReadingStage =
  | 'orientation'
  | 'problem_framing'
  | 'method_intuition'
  | 'method_mechanics'
  | 'evidence_check'
  | 'critical_review'
  | 'transfer'
  | 'synthesis'

type PaperLessonProfile = Readonly<{
  currentStage: PaperReadingStage
  stageSummary: string | null
  termsIntroduced: readonly string[]
  citedAnchorIds: readonly string[]
}>
```

`LessonSession` 增加：

```ts
lessonMode: LessonMode
paperProfile: PaperLessonProfile | null
```

约束：

- `lessonMode = 'standard'` 时 `paperProfile = null`。
- `lessonMode = 'paper'` 时 `paperProfile` 必须存在。
- `termsIntroduced` 只存术语字符串，不存 API key、prompt 原文或 Provider 原始响应。
- `citedAnchorIds` 引用已有 lesson source anchors，避免复制完整论文正文。

Contracts 同步扩展 `LessonSessionDto`、lesson start request 和 schema。旧数据读取时默认：

- `lessonMode = 'standard'`
- `paperProfile = null`

## 7. Application 边界

### 7.1 StartLessonFromDocument

扩展 start input：

```ts
type LessonStartDraft = Readonly<{
  documentId: string
  documentTitle: string
  source: LessonSourceDraft
  lessonMode?: LessonMode
}>
```

规则：

- 如果调用方未传 `lessonMode`，Application 根据 document type 推断：`paper -> paper`，其他 -> `standard`。
- 如果用户明确从普通文档启动 paper mode，Application 拒绝，避免语义错配。
- 创建 paper lesson 时初始化：
  - `currentState = 'opening'`
  - `paperProfile.currentStage = 'orientation'`
  - `stageSummary = null`
  - `termsIntroduced = []`
  - `citedAnchorIds = [initialAnchor.id]`

### 7.2 SubmitLessonReply / RetryLessonRun

在 paper lesson 中，Application 提供 paper-specific generator input：

```ts
type PaperTutorContext = Readonly<{
  paperStage: PaperReadingStage
  documentTitle: string
  sourceSnippet: string
  contextChunks: readonly LessonContextChunkSummary[]
  termsIntroduced: readonly string[]
  recentStageSummary: string | null
}>
```

Generator 返回普通 `TutorAction`，并附带 paper metadata candidate：

```ts
type PaperTutorUpdate = Readonly<{
  nextStage: PaperReadingStage
  stageSummary: string | null
  introducedTerms: readonly string[]
  citedAnchorIds: readonly string[]
}>
```

Application 校验并写入 `paperProfile`。模型不能直接写数据库，也不能新增任意 stage。

## 8. Provider Prompt 边界

新增 prompt manifests：

- `lesson.paper.first_question` v1
- `lesson.paper.follow_up` v1

Prompt 要求：

- 使用 paper reading stage 作为显式上下文。
- 不要求模型返回完整 JSON；MVP 可先返回 tutor utterance，Application 用 deterministic stage policy 更新 profile。
- 不把完整论文正文发送给 Provider，只发送选中 snippet 和 D4 budgeted chunks。
- 不持久化完整 prompt、raw Provider response、Authorization header、API key 或堆栈。

参考提示词中可吸收的行为进入 prompt guidelines：

- Socratic pacing。
- gentle correction。
- terminology first-use annotation。
- quote before critique。
- formula card when formula/derivation is requested。

MVP 不强制每轮都满足全部格式协议；优先保证可用课堂与安全边界。公式卡和引用格式可以作为 D7.2 的更强结构化输出。

## 9. SQLite 持久化

新增 migration：

### `lesson_sessions`

增加：

- `lesson_mode TEXT NOT NULL DEFAULT 'standard' CHECK (lesson_mode IN ('standard','paper'))`
- `paper_profile_json TEXT NULL`

`paper_profile_json` MVP 采用 JSON 字段，原因：

- Paper profile 第一版仍是轻量 session metadata。
- 不需要独立查询 Claim / Evidence 卡片。
- 后续卡片化时可迁移为 `paper_profiles`、`paper_claims`、`paper_evidence_cards` 等表。

JSON schema 由 Domain / Contracts 运行时校验，Infrastructure 只负责读写。

## 10. Renderer 体验

### 10.1 文档详情

当文档类型为 paper：

- 显示轻量标签“论文”。
- 开始课堂时使用 paper mode。
- 如果已有 active paper lesson，显示“继续论文课堂”。

### 10.2 课堂页

Paper lesson 在现有课堂页上增加轻量信息：

- 当前论文阶段：例如“问题定位”“方法直觉”“批判审视”。
- 阶段总结：如果存在，显示在学习诊断附近。
- 引用证据：继续复用现有 source anchor / context evidence 展示。
- 术语：MVP 可只显示已引入术语数量或简短列表，不做术语库。

不要做一个新的论文工作台首页。第一屏仍是可用课堂体验。

## 11. 错误与恢复

- 旧 lesson 没有 `lesson_mode`：按 `standard` 读取。
- `paper_profile_json` 损坏：返回稳定 `INTERNAL_ERROR`，不暴露原始 JSON。
- paper mode 启动但 document 不存在：沿用 `LESSON_DOCUMENT_NOT_FOUND`。
- paper mode 启动但 source block 不存在：沿用 `LESSON_SOURCE_NOT_FOUND`。
- Provider 失败/取消：沿用现有 failed/cancelled run 和 LessonStep 语义，不推进 paper stage。
- 重试成功：追加新 run / step，并基于当前 paper stage 继续。

## 12. 测试策略

### Domain / Contracts

- 校验 `lessonMode` 与 `paperProfile` 的组合。
- 校验 paper stage 枚举、terms trimming、cited anchor ids。
- 历史 DTO 缺省读取为 standard。

### Application

- paper document 启动 lesson 时自动进入 paper mode。
- non-paper document 不能显式启动 paper mode。
- paper first question 使用 `lesson.paper.first_question` manifest。
- paper follow-up 更新 paper stage / stage summary。
- Provider 失败或取消不推进 paper profile。

### Infrastructure

- migration 新增 `lesson_mode` 和 `paper_profile_json`。
- SQLite create/save/list/find round-trip paper profile。
- 历史 lesson 兼容默认值。

### Desktop / Renderer

- paper 文档启动后课堂展示论文阶段。
- standard 文档不展示论文阶段。
- paper follow-up 后阶段信息可更新并重启恢复。

### E2E

- 导入或创建 paper 文档。
- 从 PDF block 或搜索结果启动 paper lesson。
- 看到 paper-aware 首问和阶段标签。
- 提交回答后看到 follow-up、诊断与阶段更新。
- 重启后 paper stage、messages、model runs、diagnosis 仍可读取。

## 13. 后续扩展

D7.2 / 后续阶段可以继续扩展：

- 独立 PaperProfile aggregate。
- Claim / Evidence / Limitation / Method 卡片。
- 论文地图视图。
- 公式卡结构化 DTO。
- 引用原文块的专门 `PaperCitation` 模型。
- 图表/table 引用和截图锚点。
- 跨论文比较与研究主题图谱。

MVP 的关键是先把论文阅读变成可持续使用的课堂模式，而不是一次性完成完整研究管理系统。
