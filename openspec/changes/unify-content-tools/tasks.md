## 1. Implementation

- [x] 1.1 新增内容工具入口、旧链接跳转及权限隔离；覆盖 Compatible links and access。
- [x] 1.2 复用五种页面，提供嵌入布局、草稿保留和粘贴隔离；覆盖 Unified content tools。
- [x] 1.3 退役 resume/workline 注册并更新生成目录；覆盖 Retired module registration。

## 2. Verification

- [x] 2.1 执行专项回归、typecheck/build、Forge CLI 全阶段质量门禁及 OpenSpec 严格验证。
- [x] 2.2 浏览器验收桌面与窄屏、旧链接、操作与草稿，完成 60 秒服务稳定观察并提交本次范围。

## 验收证据

- 2026-09-13：专项回归 11 项通过；修正测试类型后重跑本次 5 项通过。typecheck、架构边界检查与完整 npm run build 成功（exit 0）；构建仅有既有 chunk 大小及重复导入提示。
- Forge CLI verify 返回 status/staticStatus/runtimeStatus=PASSED、exit 0。executedCheckers 为空，不视为静态检查已执行；API-RUNTIME-001 实际覆盖 9 个 API 场景，均返回 200。
- 浏览器在 https://localhost:5173 验证五个工具入口、JSON 正常格式化输出、切换后输入/结果保留、旧 formatter 链接参数和片段保留；390×844 窄屏确认页签滚动、输出与下载操作可达，桌面检查卡片预览与图片空状态。未重复验证未修改的全部加密算法和图片处理算法。
- 开发模式前端通过 Vite 加载当前 content-tools 源码；前端 PID 46980、后端 PID 28220，87 秒起止复查均 ready、restarts=0，后端 /api/tools 与当前前端源码均 HTTP 200。日志未新增致命启动异常。未执行 JAR 部署，后端未改动无需重建。
- 环境既有 wechat 服务 waiting restart、restarts=4，与开始状态一致，非本次范围；studio ready。构建及运行证据只声明本次前端交付。
- 按块暂存共享菜单目录和文档索引，仅提交本次变更；保留并行本机工具、菜单设置等未提交工作。OpenSpec 保持活动，未执行主规格同步/归档。
