# D7.3 Paper Stage Progression Design

## 背景

DeepStorming 已经完成：

- D7 Paper Lesson Mode MVP
- D7.1 Paper Reading Map MVP
- D7.2 Paper Structured Insights MVP

当前 paper lesson 已经具备：

- `lessonMode='paper'` 的课堂分支
- `paperProfile.currentStage`
- Why / What / How / Evidence / Limits / Next 六槽阅读地图
- Section / Claim / Evidence / Limitation 洞察卡片
- reply / retry 成功后的持久化更新与重启恢复

但现阶段的 paper stage 推进仍然偏粗粒度。当前实现本质上只有：

- `orientation -> problem_framing` 的稳定推进
- 少量关键词直跳 `method_mechanics` / `critical_review`

这会带来两个问题：

1. 课堂在论文阅读中后段缺少更细的教学节奏，容易长时间停留在前期阶段。
2. 已有 reading map 和 insight cards 已经积累了结构化线索，但阶段推进还没有把这些线索真正利用起来。

因此，D7.3 的目标是把阶段推进升级为“规则主导、模型补充”的混合方案，在不增加独立模型调用的前提下，让 paper lesson 能更自然地从问题定位推进到方法、证据、批判与迁移阶段。

## 目标

构建均衡推进的 paper stage progression，使 paper lesson 在每次成功 reply / retry 后：

1. 优先通过本地规则判断下一阶段。
2. 只有在规则信号不足时，才接受当前 provider reply 已附带的模型阶段建议。
3. 阶段默认只保持不变或向后推进，不后退。
4. 单轮最多前进一个主阶段，避免跳跃过快。
5. 为每次阶段推进生成可恢复的 `stageSummary`，说明为何进入当前阶段。
6. 与当前 reading map、insight cards、provider payload 兼容，不新增第二轮模型请求。

## 非目标

本阶段明确不做：

- 为阶段判断单独补发第二次模型请求
- 重写整套 paper prompt 架构
- 让模型直接主导整个课堂状态机
- 用户手动修改当前阶段
- 跨论文工作区或论文专用复习中心
- 复杂的论文 section 树解析或实验表格理解

## 用户体验

这版目标不是“更激进地跳阶段”，而是“更自然地推进课堂”。

用户在 paper lesson 中持续回答时：

- 当回答明显在解释论文要解决的问题时，课堂稳定停留在 `problem_framing`
- 当回答开始讨论“为什么这种方法可能有效”时，阶段推进到 `method_intuition`
- 当回答进入模块、公式、训练目标、具体流程时，阶段推进到 `method_mechanics`
- 当回答开始核验实验、指标、消融、对比结果时，阶段推进到 `evidence_check`
- 当回答提出局限、假设、漏洞、反例时，阶段推进到 `critical_review`
- 当回答讨论迁移、改进、未来方向时，阶段推进到 `transfer`
- 当回答开始整体总结论文主线和收获时，阶段推进到 `synthesis`

如果当前回答信号不够清晰，系统先尝试从本轮 provider payload 的结构化阶段建议中补足；如果没有建议或建议无效，则保持当前阶段，不乱跳。

## 方案比较

### 方案 A：纯规则推进

只根据 learner reply、当前 stage、reading map 和 insight cards 推进。

优点：

- 稳定、便宜、解释性强
- 测试成本最低

缺点：

- 对自然语言表达差异的适应性有限
- 在边界模糊时容易“卡阶段”

### 方案 B：模型主导推进

优先信任 provider 结构化输出的阶段建议，规则只兜底。

优点：

- 潜在泛化能力更强
- 更容易捕捉含蓄表达

缺点：

- 阶段可控性差
- 更依赖 provider 质量和结构化输出稳定性

### 方案 C：规则主导 + 模型补充（采用）

先由本地规则判定；只有在规则信号不足时，才消费当前 provider payload 已返回的阶段建议。

采用理由：

- 符合“均衡推进”的目标：大多数时候稳定，小概率模糊场景也不僵硬
- 延续 D7.2 的策略：优先消费当前 payload 的结构化结果，但绝不额外补发模型请求
- 保持课堂节奏可解释、可测试、可恢复

## 架构设计

### 1. 阶段推进职责边界

阶段推进仍然放在 `packages/application` 中，属于 lesson business rule。

职责分层：

- Domain / Contracts：继续只定义合法阶段枚举与会话数据结构
- Application：负责“如何判断下一阶段”
- Provider payload：只提供可选建议，不直接决定最终阶段
- Renderer：只展示 `currentStage` 与 `stageSummary`，不参与判断

Main / IPC / Preload 不新增业务逻辑，只继续透传 lesson session DTO。

### 2. 新增可选结构化字段

在当前 `StructuredPaperInsights` 上新增两个可选字段：

- `suggestedStage?: PaperReadingStage`
- `suggestedStageRationale?: string`

语义：

- `suggestedStage`：provider 对本轮回复后最合适论文阶段的建议
- `suggestedStageRationale`：简短说明该建议的依据，供 Application 生成 `stageSummary` 时参考

约束：

- 这两个字段都是“可选建议”，不是最终裁决
- 只有在规则信号不足时才会被采纳
- schema 无效时整体忽略该建议，不报错、不额外重试

### 3. 规则主导的阶段信号提取

Application 为 paper lesson 增加一组稳定的 stage signal 规则，输入至少包括：

- 当前 `paperProfile.currentStage`
- learner reply
- 已更新或待更新的 reading map
- 当前 `insightCards`

第一版不做复杂打分模型，只做稳定的关键词 / 模式信号提取。

建议映射：

- `problem_framing`
  - 信号：问题、任务、目标、贡献、要解决什么、核心主张、本文做了什么
- `method_intuition`
  - 信号：为什么有效、直觉、关键想法、核心思路、为什么这样设计
- `method_mechanics`
  - 信号：模块、流程、结构、公式、推导、loss、objective、训练、算法步骤
- `evidence_check`
  - 信号：实验、指标、结果、对比、消融、benchmark、evidence、ablation
- `critical_review`
  - 信号：局限、假设、问题、漏洞、失败案例、质疑、反例、不足
- `transfer`
  - 信号：迁移、应用、启发、改进、扩展、未来工作、其他场景
- `synthesis`
  - 信号：总结、串起来、主线、整体看、最终理解、takeaway

同时利用已有结构化状态增强判断：

- `readingMap.how` 已被连续补全时，更容易接受 `method_intuition` / `method_mechanics`
- `readingMap.evidence` 已出现明确实验摘要时，更容易接受 `evidence_check`
- 存在新的 `limitation` card 时，更容易接受 `critical_review`
- `next` 槽位出现明确迁移或未来方向时，更容易接受 `transfer`

### 4. “信号充足”与“信号不足”的边界

本阶段不引入复杂分数系统，采用简单三档判断：

- 强信号：当前 reply 明确命中某一阶段的典型模式
- 弱信号：有少量相关词，但不足以稳定判断
- 无信号：基本无法判断

决策规则：

- 强信号：直接采用规则结果
- 弱信号或无信号：尝试读取 `suggestedStage`
- 若 `suggestedStage` 无效、缺失或违反推进约束，则保持当前阶段

这样能避免模型在“规则其实已经很清楚”的情况下乱改阶段。

### 5. 推进约束

为了保持课堂节奏稳定，增加四条硬约束：

1. 不后退  
   `nextStage` 不得早于 `currentStage`

2. 单轮最多前进一个主阶段  
   例如：
   - `problem_framing -> method_intuition` 可以
   - `problem_framing -> evidence_check` 不可以

3. 初期不跳过方法理解  
   在 `problem_framing` 之后，必须先经过 `method_intuition` 或 `method_mechanics`，不能直接进入 `critical_review` / `transfer` / `synthesis`

4. `synthesis` 需要晚期信号  
   只有当前已在 `transfer` 或已经具备强总结信号时，才允许进入 `synthesis`

这些约束同时作用于规则结果和模型建议。

### 6. 最终决策流程

对每次 paper lesson 成功 reply / retry，按以下顺序决策：

1. 先完成 reading map / insight cards 的更新
2. 基于 reply + 更新后的结构化状态抽取规则阶段信号
3. 若规则强信号成立，生成规则 `candidateStage`
4. 若规则信号不足，尝试读取并验证 `suggestedStage`
5. 对候选阶段应用推进约束
6. 若约束通过，更新 `paperProfile.currentStage`
7. 生成新的 `stageSummary`

这意味着阶段推进会消费“本轮已经沉淀出的 paper understanding”，而不是只盯着一段 learner reply 文本。

### 7. `stageSummary` 生成策略

`stageSummary` 继续作为用户可见摘要和恢复语义的一部分。

本阶段改为按“来源”生成：

- 规则推进时：
  - 示例：`已进入方法直觉：当前回答开始解释为什么该方法可能有效。`
  - 示例：`已进入证据核验：当前回答开始讨论实验结果与指标是否支持主张。`

- 模型建议被采纳时：
  - 若有 `suggestedStageRationale`，优先拼接为安全短摘要
  - 若没有，使用通用模板：
    - `已进入方法细节：当前回答的规则信号不足，已采用本轮结构化阶段建议。`

约束：

- `stageSummary` 必须是安全、短文本
- 不包含 API 响应原文、密钥、原始 prompt 或内部调试细节

## 测试策略

至少补齐以下测试：

1. 规则强信号推进
   - `problem_framing -> method_intuition`
   - `method_intuition -> method_mechanics`
   - `method_mechanics -> evidence_check`
   - `evidence_check -> critical_review`
   - `critical_review -> transfer`
   - `transfer -> synthesis`

2. 模型补充推进
   - 规则信号不足时，合法 `suggestedStage` 被接受
   - 有 `suggestedStageRationale` 时写入合理 `stageSummary`

3. 约束验证
   - 模型建议后退时被拒绝
   - 模型建议跨越多个阶段时被拒绝
   - 规则或模型都不能从早期直接跳到 `synthesis`

4. 保持当前阶段
   - reply 信号不足且模型建议缺失时，阶段保持不变

5. retry 行为
   - 成功 retry 与普通 reply 使用同一推进规则

6. 持久化恢复
   - 更新后的阶段与 `stageSummary` 在仓储读写和桌面端重启后保持一致

## 风险与取舍

主要风险：

- 规则仍可能漏判，导致阶段推进偏慢
- provider 给出的建议可能偶尔过于乐观

对应取舍：

- 我们优先接受“偶尔慢一点”，而不是“经常乱跳”
- 因为本阶段明确不增加额外模型调用，所以在边界模糊时允许保持当前阶段
- 这版先把推进约束与结构化建议接线做好，后续可以逐步扩规则词表或改进 prompt

## 完成定义

当以下条件满足时，本设计视为完成：

- paper lesson 的阶段推进从粗粒度规则升级为“规则主导 + 模型补充”
- 不新增独立模型请求
- `StructuredPaperInsights` 能携带可选的阶段建议字段
- reply / retry 成功后都使用同一套推进逻辑
- `currentStage` 与 `stageSummary` 可持久化、可恢复、可展示
- `pnpm check` 通过
- `pnpm test:e2e` 通过
- `docs/planning/current-status.md` 与 `docs/planning/software-design-completion-roadmap.md` 更新到新的 D7.3 状态
