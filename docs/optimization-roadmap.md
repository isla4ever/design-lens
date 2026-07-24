# Design Lens 优化不足与迭代路线

本文记录 Design Lens 当前版本的产品、性能、证据质量和界面不足，并将每个问题转换为可执行、可验证的迭代目标。评审基线为 `0.2.0`、Bilibili 首页真实动态页面实验、20k/100k DOM 压力门禁和当前 Chrome MV3 UI 回归。

## 产品结论

Design Lens 已经从 Prompt 生成插件进阶为“证据采集、AI 上下文、重建验收”工作流。下一阶段不应继续增加采集字段、组件库或配置项，而应优先解决：

1. 捕获任务必须在页面压力异常时及时停止并恢复页面。
2. 动态内容、账号态和第三方资源必须与结构误差分开解释。
3. 用户只需要理解结果能否使用，以及下一步需要补什么。
4. 本地证据必须有明确的容量上限、生命周期和删除语义。

## 当前基线

| 维度 | 当前结果 | 结论 |
| --- | --- | --- |
| 自动测试 | 100 项通过 | 核心数据契约、容量治理和安全收尾已有回归门禁 |
| 构建 | Chrome 标准版、Collector 版通过 | 权限分层保持有效 |
| 极端页面 | 20k/100k DOM 压力门禁通过 | Smart Capture 已主动降级或停止，不继续滚动和深采集 |
| Bilibili 场景 | 13/13 场景捕获，几何失败 0 | 结构和稳定节点契约有效 |
| Bilibili 页面压力 | 最长任务 130ms，2,447 次 mutation | 需要主动止损而不只是报告降级 |
| Bilibili 候选验收 | 平均像素差 36.53%，状态覆盖 80% | 动态内容和缺失状态需要分项解释 |
| UI 门禁 | Chrome Playwright 通过，320px 英文关键按钮无截断 | 关键说明允许自然换行，按钮保持单行 |

## P0：公开 Beta 前必须完成

### 1. Smart Capture 硬截止与取消

当前总预算已经升级为跨候选索引、录制启动、页面采集和收尾流程共享的硬截止；收尾另有短暂安全窗口，避免清理过程无限等待。

目标：

- 每个阶段共享统一 deadline，并有独立的收尾最大执行时间。
- 超时或重度页面异常时，立即停止页面监听、rrweb 和动画采样。
- 清理与结果整理可以继续，但不得继续操作页面滚动、样式或动画状态。
- 最终报告明确记录 `deadline-exceeded`、`safety-stop` 和被跳过的阶段。

验收：

- 人为挂起 `startRecording` 或 `finishRecording` 时，任务能在预算内退出。
- 退出后 pointer、scroll、MutationObserver 和 PerformanceObserver 不再采样。
- 捕获 UI、隐私遮罩、滚动位置和动画播放状态全部恢复。

### 2. 页面压力分级止损

目标行为：

| 等级 | 触发示例 | 页面侧行为 |
| --- | --- | --- |
| normal | 无长任务、低 mutation | 完整捕获 |
| reduced | mutation 较高或出现 50ms 长任务 | 缩短被动观察 |
| snapshot-only | 连续 mutation storm 或极端 DOM | 停止动效和深样式扫描，只保留当前快照 |
| stopped | 200ms 长任务、硬上限或用户取消 | 立即停止页面侧工作并恢复页面 |

验收：

- 压力门禁验证每一级都会减少后续工作量，而不是只改变状态文案。
- 100k DOM 和 mutation storm 下页面心跳、滚动和点击保持可用。

### 3. 重型序列化与压缩移出页面线程

目标：

- 内容脚本不再对完整 rrweb 事件执行同步 `JSON.stringify`。
- 页面只停止 recorder 并交付结构化事件；后台负责序列化和持久化，压缩留到导出阶段按需处理。
- 大型 Rebuild Pack 导出避免同时把全部 Blob 转换为 ArrayBuffer。

验收：

- rrweb 收尾的页面线程不出现新增 50ms 以上长任务。
- 导出缺失或超限 artifact 时给出明确错误，不产生不完整 ZIP。

### 4. Artifact 生命周期和容量预算

目标：

- 删除历史结果时同步回收其不再被项目引用的 artifact。
- 自动淘汰第 9 条工作区记录时执行同样回收。
- 限制单 artifact、单捕获项目和导出包总大小。
- `QuotaExceededError` 转换为可理解的恢复建议。

验收：

- 删除记录后，对应孤立 artifact 数量归零。
- 多路由项目仍引用的 artifact 不被误删。
- 容量超限不会留下半写入项目。

## P1：可信重建闭环

### 1. 动态区域分类

为可见区域增加以下分类：

- `stable`
- `dynamic-content`
- `account-state`
- `third-party`
- `animation`
- `unknown`

验收报告分别展示结构误差、稳定区域像素误差、动态内容误差、账号态差异和外部资源错误，不再只给一个平均像素差。

### 2. 安全的 open 状态补采

只自动识别 `aria-controls`、`aria-expanded`、`details`、`dialog`、`popover` 和明确菜单/抽屉语义。插件可以发现和引导，但不自动执行登录、支付、提交、跳转或未知业务点击。

### 3. 动画证据闭环

- 可寻址的有限 CSS/WAAPI 动画保存 25%/50%/75% checkpoint。
- 循环动画、视频、Canvas 和 WebGL 进入动态区域分类，不伪装为可寻址动画。
- 任何 seek 操作必须恢复原始 currentTime、playState 和 viewport。

### 4. 用户可理解的结果等级

内部继续保留 `complete`、`degraded`、`partial` 和 `missing`；界面统一呈现：

| 等级 | 用户含义 | 主操作 |
| --- | --- | --- |
| 可直接参照 | Reference 所需结构和设计语言足够 | 导出资料包 |
| 可进入重建 | 有截图、关键几何和必要状态 | 导出重建草稿 |
| 需要补采 | 存在关键状态、视口或动态证据缺口 | 执行一个下一步任务 |

## P1：UI 与首次使用流程

### 信息架构

默认主流程保持为：

```text
选择 Reference / Rebuild -> 智能捕获 -> 查看结果等级 -> 导出或补一个缺口
```

- Popup 只保留快速动作，不放详细诊断。
- Side Panel 是默认完整工作区。
- AI、Canvas、资产策略、技术栈和高级验收按需展开。
- 首次用户先完成捕获，再在生成 Prompt 时配置 AI。

### 窄屏文字规则

- 按钮保持单行，使用为 320px 设计的短文案和完整 `aria-label`/`title`。
- 页面标题、域名等可识别信息允许省略。
- 任务原因、错误、配置指引和结果结论不得被静默截断。
- UI 门禁新增“可见文字仍可理解”检查，不只检查 overflow 和 nowrap。

## P2：后续进阶

- 多路由之间的结构和 Token 差异视图。
- 可选的本地匿名性能统计，不上传页面证据。
- 资产替代清单和本地占位素材策略。
- 增加电商、文档站、Canvas/WebGL、登录态页面真实回归案例。
- 审计采集、存储、导出、AI 上下文每一层的截断数量，并写入 Evidence Pack。

## 本轮实施结果

- [x] Smart Capture 阶段硬截止与主动止损
- [x] rrweb 结构化事件交给后台序列化
- [x] 工作区记录删除和淘汰时回收孤立 artifact，并保留共享证据
- [x] 单文件 24 MB、单项目 96 MB 容量预算与可理解错误
- [x] 结果等级进入 Side Panel 和 Popup 概览
- [x] 英文窄屏短文案与关键文字完整性门禁
- [x] AI 设置在首次使用时展开，已有配置时按需收起
- [x] 100 项单元回归、Chrome/Collector/Firefox 构建、Playwright UI、注入和压力回归
- [x] npm 依赖审计：`npm run audit:dependencies` 已通过，结果为 0 vulnerabilities

## 本轮实现细节

### Smart Capture 安全主链路

- `normal -> reduced -> snapshot-only -> stopped` 四级状态由 `CaptureBudgetGuard` 统一判定。
- 50 ms 长任务或较高 mutation 进入 `reduced`；连续 mutation storm 或极端 DOM 只保留当前快照；200 ms 长任务、mutation 硬上限、统一 deadline 直接停止页面侧工作。
- 页面侧接收同一个可变执行上下文，实时看到安全等级变化；停止后不再启动 timeline、rrweb、CDP 深采集、整页滚动截图或第二次全页扫描。
- Smart Capture 自动截图限制为当前视口；用户明确发起的手动录制仍可使用完整长页流程。
- 最终化写入只执行一次，避免“录制收尾”和“Smart Capture 完成”重复保存同一工作区记录。

### 证据和存储

- rrweb 事件通过结构化消息交给后台，在 `artifact-serialization.ts` 中统一序列化并执行 8 MB 交互记录上限。
- `CaptureProjectStore` 对单 artifact 和单项目设置 24 MB / 96 MB 上限，并把 `QuotaExceededError` 转成删除旧结果后重试的明确错误。
- 删除历史记录、自动淘汰第 9 条记录和清空工作区时，只有不再被其他工作区记录或项目引用的 artifact 才会回收。

### UI 和结果语义

- 概览层将内部状态映射为“可直接参照 / 可进入重建 / 需要补采”，并把高优先级缺口绑定到一个下一步操作。
- Popup 保持轻量快捷操作；Side Panel 承载覆盖、Recorder、历史和设置等完整信息。
- 关键错误、任务原因、首次配置指引不再使用静默省略；按钮文本保持单行，英文 320px 使用 `Pick area` 等短语义文案。
- Playwright UI 门禁新增按钮文本实际可见宽度和关键说明截断检查。

## 发布判定

满足以下条件后，才建议从 Alpha 升级到公开 Beta：

1. 所有 P0 项有自动回归测试。
2. 20k/100k DOM 和 mutation storm 下页面恢复门禁通过。
3. 至少三个真实动态网站完成捕获后可继续滚动、点击和输入。
4. 验收报告能区分结构差异与动态内容差异。
5. 中文 360px、英文 320px 的关键操作和结论文案都可理解。

当前状态：P0 主链路、存储、UI 回归和依赖审计已完成；公开 Beta 前仍需补充至少三个真实动态网站的回归报告和动态区域分项误差统计。
