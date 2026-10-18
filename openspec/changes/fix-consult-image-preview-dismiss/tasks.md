# 任务

- [x] 核对咨询图片查看器、移动咨询层级与现有全屏 Portal。
- [x] 独立 Dialog 浮层、常显文字关闭按钮、安全区及键盘/焦点恢复。
- [x] 图片关闭 3 项回归通过：独立 Portal/文字关闭/焦点恢复、图片与背景点击/Escape、原生全屏。首次全屏夹具因 jsdom 缺少 fullscreenElement 失败，补齐并恢复属性后通过。
- [x] OpenSpec 严格校验通过；Forge Quality JSON status=PASSED、退出码 0，仅执行既有 9 项 API 探测，executedCheckers 为空。
- [x] 前端 npm run typecheck：菜单目录、Feature boundaries 与 tsc 均通过，退出码 0。
- [ ] 桌面及移动浏览器验收：Chrome 连接不可用；Edge 读取现有咨询标签页超时，未取得实际布局证据。未重启服务。
