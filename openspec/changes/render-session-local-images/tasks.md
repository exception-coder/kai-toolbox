# 任务与证据

- [x] 核对磁盘文件存在，复现盘符/file 图片被消毒为空地址及其他本地路径未经过读取接口。
- [x] 补齐会话鉴权、复用项目路径策略、图片类型与大小限制的读取端点。
- [x] 修复 Markdown 地址保存、鉴权读取、重试及会话/对象地址生命周期。
- [x] 完成定向回归、浏览器隔离样例、类型检查、前端构建、宿主装配和质量门禁。
- [x] 同步验证证据并本地提交。
- [ ] 用户明确确认重启后核验实际消息及真实磁盘图片；此前不宣称在线修复完成。

开始时已记录 Git 状态；图片 `D:/Users/zhang/myWork/kai-toolbox/.git/preview-engine-agent-working.png` 存在且为 47,625 字节。修复前 6 项路径回归全部失败：盘符/file URI 的 img src 为空，其他本地路径仍直接进入 img src，均未调用受控图片读取。

实施中新增会话切换回归发现旧 Portal 目标在新内容提交前会短暂保留，可能以新会话读取旧路径；现已将目标与 HTML/会话快照一起绑定，在替换前卸载旧图片。测试曾失败，修正后再验证，不以跳过用例交付。

2026-10-27 验证：Markdown 路径、页面预览、站点和延迟图形 44 项前端回归通过；SessionImageController、SessionFileController、SessionLocalPathAccessService 合计 13 项后端测试通过。前端 typecheck、Vite 生产构建和 toolbox-starter 依赖链 41 模块宿主打包成功。此次 Maven 跳过前端复制，不能据此宣称 jar 已内嵌本次前端；前端产物单独构建验证。OpenSpec strict 校验通过。

Chrome 隔离页面使用真实组件及原截图字节，盘符和 file URI 均解码为 981×742；桌面显示正常，390px 视口两张图显示宽约 366px，文档无横向溢出。隔离图片接口替身不证明线上后端已加载新端点；临时页面与标签已清理。截图证据 `.git/local-image-mobile-proof.png` 不进入提交。

原生质量门禁 JSON status=PASSED、退出码 0；执行 9 项既有 API 探测，无静态 checker 被执行。这些探测仅证明当前既有服务响应，不能代替本次图片接口的重启后验收。当前尚未重启、未执行真实会话端到端验收，不标记该运行任务完成。
