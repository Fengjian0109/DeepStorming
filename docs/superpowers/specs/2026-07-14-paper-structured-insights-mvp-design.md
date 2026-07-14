# D7.2 Paper Structured Insights MVP Design

## 背景

DeepStorming 已经完成 D7 Paper Lesson Mode MVP 与 D7.1 Paper Reading Map MVP。当前 paper lesson 能：

- 对 `documentType='paper'` 的文档自动进入 `lessonMode='paper'`
- 维护 `paperProfile.currentStage`
- 持久化并展示 Why / What / How / Evidence / Limits / Next 六槽阅读地图
- 在成功 reply / retry 后 deterministic 更新地图

但现阶段的 paper workflow 仍然偏“阶段化摘要”。它缺少一层更稳定的结构化沉淀，无法把课堂过程中逐渐形成的论文理解拆分为更便于回看和后续扩展的卡片化洞察。

本阶段新增“结构化论文洞察（structured insights）”层：在每次 paper lesson 成功交互后，自动把本轮理解沉淀为结构化 insight cards，并继续同步更新六槽阅读地图。

## 目标

构建 D7.2 Paper Structured Insights MVP，使 paper lesson 在每次成功 reply / retry 后：

1. 优先采用模型返回的结构化 paper insights。
2. 模型结果缺失、失败或不合法时，自动回退到规则驱动抽取。
3. 同步更新：
   - 已有六槽 reading map
   - 新增 paper insight cards
4. 在桌面端课堂详情中展示洞察卡片，并在重启后恢复。

## 非目标

本阶段明确不做：

- 跨论文聚合、跨文档工作区、论文知识库
- 手动“重新抽取/重新整理”按钮
- 用户编辑、拖拽、排序、删除 insight cards
- 独立的论文专用 review scheduler
- 复杂 section 树、严格论文目录解析、引用网络
- 要求所有 provider 都必须支持结构化输出

## 用户体验

对于 paper lesson，用户在每次成功回答后会看到两层结果：

1. 现有 `论文阅读地图` 继续被更新，用于展示压缩后的当前理解。
2. 新增 `论文洞察卡片`，按 Section / Claim / Evidence / Limitation 分组展示本轮沉淀出的结构化结果。

如果当前 provider 提供了合法的结构化结果，系统优先使用模型结果；否则自动回退到规则抽取。用户不需要额外操作，也不需要感知内部回退流程，只会看到稳定更新后的 paper workspace。

## 方案比较

### 方案 A：纯规则驱动

只基于当前 stage、learner reply、source snippet、context chunks 做 deterministic 提取。

优点：

- 稳定、可控、易测试
- 不依赖真实 provider
- 和当前 D7 / D7.1 架构最自然衔接

缺点：

- 泛化能力有限
- 结构化质量上限较低

### 方案 B：纯模型结构化输出

要求 provider 在 paper follow-up 场景中直接返回结构化 JSON。

优点：

- 表达力更强
- 泛化更好

缺点：

- 强依赖 provider 能力和 JSON 稳定性
- 会把 D7 工作流与 D1 / 真实 API 验收强耦合

### 方案 C：混合模式（采用）

优先使用模型结构化结果；若缺失、失败或不合法，则回退到规则驱动抽取。

采用理由：

- 满足“先规则兜底，有模型时优先用模型结构化结果”的产品方向
- 既能保持工作流稳定，又能为后续更高质量抽取留下升级路径
- 能在不破坏现有 lesson 主链路的前提下渐进演进 provider 能力

## 架构设计

### 1. Domain 扩展

在 `packages/domain` 的 `PaperLessonProfile` 下新增 `insightCards`：

- `readingMap`：继续作为当前压缩后的六槽状态
- `insightCards`：保存结构化洞察卡片流

新增概念：

- `PaperInsightCardKind = 'section' | 'claim' | 'evidence' | 'limitation'`
- `PaperInsightCardConfidence = 'fallback' | 'model'`
- `PaperInsightCard`

建议字段：

- `id`
- `kind`
- `title`
- `summary`
- `sourceAnchorIds`
- `stage`
- `confidence`
- `updatedAt`

约束：

- 仅 `lessonMode='paper'` 时允许存在 `paperProfile.insightCards`
- 旧 paper profile 缺失 `insightCards` 时，归一化为空数组
- 每个 `kind` 最多保留最近 3 张卡片
- 每轮成功交互里，每个 `kind` 最多新增或更新 1 张

### 2. Contracts 扩展

`packages/contracts` 中的 `LessonSessionDto` 同步扩展：

- 新增 `paperInsightCardKindSchema`
- 新增 `paperInsightCardConfidenceSchema`
- 新增 `paperInsightCardSchema`
- `paperLessonProfileSchema` 新增 `insightCards`

Renderer 只能通过 Contracts 消费这些 DTO，不得跨越边界直接依赖 Domain / Application / Infrastructure。

### 3. Application 更新流程

仅在以下时机触发 structured insights 更新：

- paper lesson 成功 reply
- paper lesson 成功 retry

失败、取消和非 paper lesson 不更新。

更新顺序：

1. 尝试读取模型结构化结果
2. 若结构化结果缺失、失败或 schema 校验失败，则回退到规则抽取
3. 统一走一个合并器，把结果写回：
   - `paperProfile.readingMap`
   - `paperProfile.insightCards`

Application 层需要新增一个明确的 paper insights builder / merger，而不是把逻辑散落在 IPC 或 Renderer。

### 4. 模型优先策略

第一版不要求所有 provider 都支持结构化输出，但 Application 要为“有结构化结果”的 provider 预留接入点。

建议数据流：

- Provider 正常返回 tutor text reply
- 可选附带 `structuredPaperInsights`
- Application 先验证 `structuredPaperInsights`
  - 合法：优先采用
  - 非法或缺失：忽略并回退规则抽取

这样即使 provider 侧只实现了普通自然语言回复，paper workflow 仍然完整可用。

### 5. 规则兜底策略

规则驱动提取依赖：

- 当前 `paperStage`
- learner reply
- 当前 source snippet
- context chunks
- 既有 `readingMap`
- 既有 `insightCards`

第一版规则只追求稳定可测，不追求高召回。

按阶段的主更新方向：

- `orientation` / `problem_framing`
  - 优先更新 `why` / `what`
  - 倾向生成 `claim` 或 `section` 卡片
- `method_intuition` / `method_mechanics`
  - 优先更新 `how`
  - 倾向生成 `section` 或 `claim` 卡片
- `evidence_check`
  - 优先更新 `evidence`
  - 倾向生成 `evidence` 卡片
- `critical_review`
  - 优先更新 `limits`
  - 倾向生成 `limitation` 卡片
- `transfer` / `synthesis`
  - 优先更新 `next`
  - 允许对已有 card 做补充，但不强制新增

### 6. 合并策略

reading map 与 insight cards 的职责不同：

- `readingMap`：保持每个槽位一个“当前摘要”
- `insightCards`：保存增量化的结构化洞察

合并原则：

- 有相似旧卡时，更新旧卡，不重复新增
- 无相似旧卡时，新增一张
- 新增后按 `kind` 裁剪到最近 3 张
- `confidence='model'` 的结果优先级高于 `fallback`

“相似”在 MVP 中不做复杂语义匹配，使用保守启发式即可，例如：

- 同 kind
- title 规范化后相同或高度相近
- summary 前缀/关键词高度重叠

### 7. 持久化设计

继续复用 `lesson_sessions.paper_profile_json`。

本阶段不新增 migration，原因：

- `readingMap` 已经复用该 JSON 字段成功扩展
- `insightCards` 仍属于同一 paper lesson 聚合内的 paper metadata
- 旧数据可通过 Domain normalization 兼容

兼容要求：

- 新数据：正常读写扩展后的 `paperProfile`
- 旧数据：若缺失 `insightCards`，读取为 `[]`
- 更旧 paper profile：若同时缺失 `readingMap` 和 `insightCards`，统一补默认结构

### 8. Renderer 展示

在 `LessonWorkspace` 中，paper lesson 详情区保持两层结构：

1. `论文阅读地图`
2. `论文洞察卡片`

洞察卡片展示规则：

- 按四组展示：Section / Claim / Evidence / Limitation
- 每张卡片显示：
  - `title`
  - `summary`
  - `stage`
  - 是否已关联证据
  - 来源标记：`模型` / `规则`
- 空分组不显示
- standard lesson 不显示任何 paper-specific UI

第一版不提供编辑、折叠管理、拖拽排序。

## 错误处理

### 模型结构化结果不合法

如果 provider 返回了结构化字段，但 schema 校验失败：

- 不影响当前 tutor reply 成功
- 忽略该结构化结果
- 回退到规则抽取
- 不向用户暴露原始 JSON 错误

### 规则抽取无法产出有效结果

如果规则抽取最终没有可更新内容：

- 允许只保留原有 readingMap / insightCards
- 不抛出错误
- lesson reply / retry 仍然按成功处理

### 失败或取消

当 reply / retry 的模型 run 为 failed / cancelled 时：

- 不更新 readingMap
- 不更新 insightCards
- 保持当前数据不变

## 测试策略

### Domain

- 默认 `insightCards = []`
- standard lesson 携带 paper insight 字段被拒绝
- 旧 paper profile 缺失 `insightCards` 时自动补空数组
- 每类最多保留最近 3 张的约束成立

### Contracts

- `LessonSessionDto` 可解析带 insight cards 的 paper profile
- 非法 `kind` / `confidence` / 空标题 / 空摘要会被拒绝

### Application

- 成功 reply 时：
  - 有合法模型结构化结果 → 优先采用
  - 无结构化结果 → 回退规则抽取
  - 非法结构化结果 → 忽略并回退
- 成功 retry 走同样逻辑
- failed / cancelled 不更新
- 相似卡片走更新
- 超过 3 张时按 kind 裁剪

### Infrastructure

- SQLite repository 保存 / 读取带 `insightCards` 的 `paperProfile`
- 旧 `paper_profile_json` 缺少 `insightCards` 时读取兼容

### Renderer

- paper lesson 显示洞察卡片分组
- standard lesson 不显示
- 来源标记、阶段标签、证据标记正确显示

### E2E

- 从 PDF paper lesson 启动后可见 `论文洞察卡片`
- 提交回答后地图与卡片一起更新
- 重启后 readingMap 与 insightCards 都恢复

## 边界与后续扩展

本阶段完成后，D7 的论文工作流会从“阶段 + 六槽摘要”升级为“阶段 + 六槽摘要 + 结构化洞察卡片”。

后续可继续扩展为：

- 让更多 provider 返回真正的结构化 JSON
- 从 PDF page / block / section 提供更强的 section-aware 抽取
- 跨论文聚合 claim / evidence / limitation
- 基于 insight cards 生成论文专用 review items

## 验收标准

D7.2 Paper Structured Insights MVP 完成必须满足：

- paper lesson 成功 reply / retry 后会尝试更新 structured insights
- 模型结构化结果合法时优先采用
- 模型结果不可用时规则兜底仍能完成更新
- insight cards 可持久化、可恢复、可展示
- standard lesson 不受影响
- `pnpm check` 通过
- `pnpm test:e2e` 通过或仅保留既有明确跳过前提
