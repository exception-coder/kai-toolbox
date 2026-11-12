# Forge 浏览器长期运行的内存增长

2026-11-13，针对 Chrome 任务管理器中 Forge 页面接近 2.8 GB 且持续增长的反馈排查。已找到并修复两处诊断数据保留问题；不能据此认定截图中的全部进程内存均由这两处造成。

## 真实页面快照

对象为 `https://localhost:5173/tools/claude-chat`，Chrome 渲染进程 PID 14996。通过原生 Chrome DevTools Memory 面板实际采集，不是服务器内存或模拟页面。

| 快照 | 面板总量 | 对象数量 | 关键发现 |
| --- | --- | --- | --- |
| 首次快照 | 145 MB；摘要统计 144 MB | 1,384,436 | `PerformanceMeasure` 552,671 个，浅层约 67,076 kB；`Performance` 保留约 68,114 kB，占 47% |
| 后续快照 | 74.5 MB；摘要统计 73.3 MB | 797,397 | 页面期间发生了上下文变化，前次快照已从面板消失，不能作为相同条件下的修复前后收益 |

首次快照还显示：调试记录形状 `{id, ts, dir, type, seq, text}` 共 301 个，合计保留约 1,360 kB；`(sliced string)` 497 个，保留约 1,264 kB。离开 DOM 树的 `div` 有 1,445 个，保留约 5,016 kB，尚未获得稳定的增长趋势及根引用链，不能直接判定为另一处泄漏。以上保留大小有重叠，不能相加。

进程私有内存在排查中曾由约 2.9 GB 回落至数百 MB，之后又升至约 1.2 GB。Chrome 进程内存包括 V8、Blink、渲染和分配器等；JS 活跃堆、快照统计、任务管理器内存不是同一指标。采集快照本身会触发 GC，DevTools 也有观测开销，不应把采样后的下降直接当修复效果。

当前实际前端进程命令是 `npm run dev -- --strictPort --port 5173`，浏览器加载了开发源码。`node forge.mjs frontend status` 返回的是既有静态制品信息，不能据此认定正在访问静态构建。安装的 `react-dom` 为 19.2.5。

页面快照已在 DevTools 中采集并读取统计，但窗口多次最小化、快照列表被清空，未成功导出原始页面文件。保留上述实际观测结果，不把后续受控复现文件冒充页面快照。

## 根因与处理

### React 开发性能测量长期积累

本地 `react-dom-client.development.js` 会调用 `performance.measure()`，为 `Components ⚛` 和 `Scheduler ⚛` 写入测量记录，当前安装文件没有对应的 `clearMeasures`。真实快照中的 User Timing 对象是最大的明确保留来源。

[React 官方说明](https://react.dev/reference/dev-tools/react-performance-tracks)指出 Performance Tracks 在开发构建默认启用，普通生产构建默认关闭。[上游修复 #34803](https://github.com/facebook/react/pull/34803)也明确解释了未清理 measure 对 Chromium 内存的影响，并使用 `clearMeasures(name)` 释放记录。

本次在开发入口安装一个原生 `PerformanceObserver`，仅处理带有上述 React 轨道标识的 measure，按名称释放；首次处理已有积累，此后只处理增量，热替换时注销观察器。业务 measure、mark、resource、navigation 不执行全量清理。此兼容修复不替换 React、不改 Agent 调度，也不关闭开发警告。`clearMeasures(name)` 是按名称操作，业务埋点应使用自身命名空间，避免与 React 轨道的名称相同。

### 调试日志截断仍可能保留大报文

`debugLog.ts` 在调试面板关闭时仍保留最近事件。原实现用 `slice` 截取报文前缀；V8 的 SlicedString 可通过父引用保留整条输入。原限制只有条数和表面字符数，最后一个调试窗口关闭时也不立即缩容。

本次将截取部分复制成独立字符串，保留 UTF-16 内容，避免截断完整的代理项对；增加按双字节字符及固定元数据保守估算的总容量：普通模式 1 MiB、调试窗口打开期间 8 MiB。条数和单条长度上限继续保留。最后一个窗口关闭时立即缩容、缩短长报文并通知订阅者，无需等待新消息。

使用真实模块，在 Node 24.16.0 / V8 独立进程强制 GC 后复现 40 条各约 1 MiB 的 JSON 报文：

| 版本 | 日志条数 | 表面字符数 | 相对基线保留的堆内存 |
| --- | --- | --- | --- |
| 修复前 | 40 | 164,360 | 41,956,488 字节，约 40.0 MiB |
| 修复后 | 40 | 164,360 | 185,776 字节，约 0.18 MiB |

这是两次独立进程受控复现中的约 99.6% 降幅，不是整个 Forge 页面内存的下降比例。回归用例直接加载实际模块并启用 `--expose-gc`；只断言字符串长度无法发现原问题。

本机 `%LOCALAPPDATA%\Temp\forge-memory-20261113\` 已保存 `debug-log-before.heapsnapshot`、`debug-log-after.heapsnapshot`、对应指标 JSON 和复现脚本。它们是加载实际模块、使用合成报文的 Node/V8 快照，不包含用户聊天报文。离线遍历快照的 sliced-string 边：修复前有 40 个大于 1 MiB 的原始父字符串，合计 41,944,640 字节；修复后大父字符串为 0 个、0 字节。`snapshot-analysis.json` 保存该聚合结果。

## 验证与交付边界

- 调试缓存 6 项测试：总容量、顺序、关闭缩容、多窗口引用、Unicode、清空及真实 GC 保留量。
- 会话 WebSocket 隔离 30 项既有回归，保持接收、发送与会话隔离行为。
- React 性能记录 4 项测试通过，覆盖轨道筛选、增量消费、注销、API 缺失及真实 User Timing 记录回收；1000 条 React 测量被清理，业务测量仍保留。合计 40 项定向测试通过。
- 类型检查通过（已修正测试回调参数数量错误）、Feature 边界及菜单目录检查通过，Vite 生产构建通过，项目门禁 `status: PASSED` / 退出码 0。构建输出到本机临时目录，未发布或替换静态制品；构建仍有既有大 chunk 和静态/动态混合导入警告。
- 项目门禁的 runtime 验证为 `API-RUNTIME-001` / `toolbox-api-tools` 的 HTTP 200；`executedCheckers` 为空。该结果不证明新前端已运行或浏览器内存长期稳定。
- 未执行 Forge 服务重启。长期稳定验收仍需在明确版本下，按相同会话切换、流式输出和打开/关闭调试窗口场景连续采样；不将开发页面自动更新、GC 或一次低值当作验收完成。

## 后续采样方法

在 Memory 面板采集基线和经过同样操作后的快照，记录时间、页面版本、会话范围及是否发生导航/刷新；用 Comparison 查看增量，用 Retainers 追踪实际根引用。重点核对 `PerformanceMeasure` 是否持续增长、日志短字符串是否保留大父串，以及 Detached DOM 是否在多次 GC 后仍增长。

原始 `.heapsnapshot` 可能包含聊天内容及凭据，只保存在本机诊断目录，不提交 Git 或上传外部服务。诊断结论只保留类型、数量和大小。浏览器持续稳定运行后的进程内存趋势，仍是判断截图所述问题是否完全消除的必要证据。

本次是内部诊断缓存修复，不改变 AI 编程架构、会话状态契约或发布权限。
