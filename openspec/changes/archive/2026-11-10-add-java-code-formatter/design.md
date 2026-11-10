# Java 代码格式化设计

一期复用既有内容工具和 formatter feature，不增加重复的开发者工具全局列表。主对象是用户粘贴的代码原文，原文版本与格式化选项标识一次计算；结果是可核对的副本，不写回代码文件。适用 OBJ-01、NAV-01、CTX-01、FEED-01、CTRL-01、DENS-01、IDEM-01，无例外。

入口 `/tools/content-tools?tool=formatter&format=java`；原 `/tools/formatter` 继续重定向并保留参数。格式页签写入 URL 并保留本页已访问视图的输入，关闭页面后不保存代码。Java 桌面左右对照，手机在原文与结果之间切换；格式化成功自动展示手机结果，原文仍可返回。用现有 CodeMirror、主题 token 和 Button，无额外 Card。Shell 剩余高度经内容工具和格式化页传递给编辑器；编辑器独立滚动，操作栏保持可达，不使用 100vh 减猜测顶栏高度。

## 实现与边界
CodeMirror 提供 Java 高亮、行号、折叠、括号匹配和撤销。纯函数负责识别解析入口与生成格式化副本；Worker 客户端负责单次任务、超时、取消和失败；Hook 负责输入/选项版本及复制反馈。全部留在 formatter 内，跨 feature 仍走 public-api。

浏览器版 Prettier 3.9.10 显式加载插件，Java 插件固定 2.8.1、java-parser 3.0.1。已核对当前插件 2.11.0 的 Tree-sitter/WASM 初始化及 2.9.0 起移除旧解析实现；本次选用最后一个纯 JavaScript 版本 2.8.1，原因是其已公开支持片段 entrypoint，避免为单个方法引入 WASM 资源装配和包装类拆除。不是最新版本；语法范围以真实解析结果为准，不声称支持所有新 Java 语法。后续确需新语法时再迁移，不能静默扩大加载链路。

自动识别依次尝试文件、接口成员（含 default 方法）、类成员、语句与表达式，也允许显式选择。解析器要求消费完整输入。缩进默认 4 空格，行宽默认 100；字符串、标识符和注释交由 Java 语法解析器处理，不用正则缩进代码。复制下载需要当前原文与选项对应的有效结果；输入更新或计算失败时保留上一份结果并标明已过期。代码只在内存/Worker 之间传递，不上传、不执行、不写浏览器持久存储。

单次最多 256 KiB，Worker 按首次格式化创建；最长 15 秒，可取消并重试。重复点击进行中操作被拒绝；输入/选项改变取消旧任务，晚到消息按任务 ID 和输入版本丢弃。Worker 不可用时保留高亮查看、说明重试路径，不降级为阻塞主线程的大文本格式化。

## 反馈与验收
空输入提供粘贴说明；计算中显示状态和取消；成功显示识别类型、行数及复制状态；语法错误定位原文并保留输入/旧结果；剪贴板不可用提示手动选择复制。页签支持方向键和 Home/End，Ctrl/⌘+Enter 格式化。实测用户原始 default 方法、泛型/lambda/中文注释、字符串与文本块、完整文件、不完整语法、输入变化及 Worker 失败恢复；浏览器检查桌面高低窗口和手机、长短代码的末行与操作栏。

二期语言扩展由实际需求驱动；本次不新增代码运行器、远程格式化服务或 AI 代码改写。

研究于 2026-10-13：[Prettier 浏览器/Worker API](https://prettier.io/docs/browser/)、[Java 2.8.1 片段入口](https://github.com/jhipster/prettier-java/blob/prettier-plugin-java%402.8.1/packages/prettier-plugin-java/README.md)、[插件迁移记录](https://github.com/jhipster/prettier-java/blob/main/CHANGELOG.md)、[CodeMirror Java 扩展](https://github.com/codemirror/lang-java)。
