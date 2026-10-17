## Decisions

`MobileSessionStatus` 提供队列和功能操作的展示插槽，`MobileAgentDock` 装配现有 `QueuedList`、语音和会话记录，继续从原 props 读取同一份数据及回调。标题与队列不随正文滚动，队列自身限制高度并可滚动；下方操作、会话切换和监控内容在独立区域滚动。Sheet 沿用 80dvh 高度上限，队列最多 32dvh，保持关闭按钮和下面功能可达。

OBJ-01、CTX-01：队列归属不变，关闭面板后恢复 Dock 焦点。DENS-01：队列、语音/记录操作、功能入口和会话切换在前，运行概览、执行详情与诊断在后。FEED-01：显示队列数量、空态及暂停原因，打开不触发发送。CTRL-01、IDEM-01：原发送条件和回调保持不变，不新增状态源或队列副本。无原则例外。

## Verification

扩展现有 Dock 测试，覆盖长会话列表、置顶队列、空队列、暂停提示和原发送/移除/清空回调；执行 MobileSessionStatus 既有回归、frontend typecheck、OpenSpec strict 和项目质量入口。浏览器核对滚动下面内容时队列仍可见，记录桌面与可完成的窄屏结果。无重启或发布；回滚可撤销本次 UI 提交。
