# D3：文档内嵌阅读器与证据定位设计

## 状态

已确认，进入实现规划。

## 目标

在现有文档详情页内嵌一个面向文本层 PDF 的阅读器壳，使用户能够按页查看解析结果、搜索并选中 block，然后从该 block 开始课堂。课堂需要保留稳定的页码与 block 来源，并支持回到原文证据。

## 非目标

本阶段不实现 PDF canvas 渲染、OCR、缩放、bbox 坐标、多窗口阅读、chunk/embedding 索引，也不改变现有 PDF 文本提取器。

## 用户流程

1. 用户导入 PDF 并打开文档详情。
2. 详情页加载页面及其 blocks，显示页码、文本和加载/错误状态。
3. 用户按页导航或搜索 block，选中 block 后看到高亮和“用此 block 开始课堂”。
4. 应用校验 block 属于当前文档，创建课堂并保存原有文本范围及 PDF target。
5. 课堂页显示“第 N 页 · Block M”，并提供“回到证据”操作，返回文档详情并重新定位该 block。

## 数据模型

保留现有文本锚点字段，增加可选的 target 元数据：

```ts
type LessonSourceTarget =
  | { kind: 'text_range' }
  | {
      kind: 'pdf_block'
      pageNumber: number
      blockId: string
      blockIndex: number
    }
```

`LessonSourceAnchor` 和 `LessonStartDraft.source` 继续携带 `startOffset`、`endOffset`、`snippet`。旧数据没有 target 时归一化为 `{ kind: 'text_range' }`；PDF block 仍保存文本范围和 snippet，确保提示词、审计和旧客户端行为不受影响。

数据库迁移在 `lesson_source_anchors` 增加 nullable `target_json`。读取 NULL 时使用 text range；写入 PDF block 时写入严格 JSON。迁移不回写旧行，也不删除 snippet。

## 模块边界

- Domain：定义 target 类型、默认归一化及不变量；不依赖 Electron、React 或 SQLite。
- Contracts：为 lesson source anchor/start draft 增加严格的 target schema，并保持旧请求兼容。
- Application：在开始课堂前验证 target 格式及 block 所属文档；新增来源定位 port，不直接访问数据库。
- Infrastructure：实现来源定位查询、迁移和 repository 映射；旧 `target_json` NULL 映射为 text range。
- Main：注册迁移、组装 port、沿用现有 lesson IPC，仅负责校验、调用 use case 和错误映射。
- Preload：继续暴露显式 lesson/documents API，不增加通用 invoke。
- Renderer：新增聚焦的 `PdfReaderPanel`，由 `DocumentLibrary` 负责页面详情状态；课堂组件只消费 Contracts，并通过 App 回调回到文档证据。

## 文本范围映射

阅读器开始课堂时，以已加载页面文本拼接规则（页间 `\n\n`）计算 block 在文档 plainText 中的范围。若 block 文本无法唯一映射，则禁用开始按钮并显示稳定的“证据文本不可定位”提示，避免生成错误来源。

## 错误与取消

- 页面/block 加载显示 loading、success、error，并提供重试。
- 已删除或不属于文档的 block 返回 `LESSON_SOURCE_NOT_FOUND`，不创建课堂。
- 创建课堂沿用现有请求幂等和取消语义；阅读器本身没有长任务，不额外引入取消控制。
- 所有异常映射为稳定错误码和用户可读消息，不在 renderer 暴露原始异常。

## 验收测试

- Domain：target 默认值、PDF block 字段及非法值。
- Contracts：新旧 lesson start/anchor payload 的 schema 校验。
- Application：合法 block 可创建课堂，跨文档/不存在 block 被拒绝。
- Infrastructure：迁移、NULL 兼容读取、target JSON 往返。
- Renderer：页码导航、block 搜索、高亮、开始课堂、课堂来源展示和回跳。
- E2E：导入 PDF → 详情页选 block → 开始课堂 → 显示页码/block → 回到证据并高亮原 block；旧文本锚点课堂仍可打开。

## 风险与后续

当前 extractor 通常按页产生单一 block；未来引入更细粒度 block 时，只需保持 blockId 稳定并复用 target schema。bbox、缩放和真正的 PDF 视觉渲染留给后续阶段，避免本阶段把文本证据链与渲染实现耦合。
