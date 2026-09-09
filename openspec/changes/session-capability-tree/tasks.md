## 1. Capability Contract

- [x] 1.1 定义 Sidecar 会话能力快照和 App Server 目录解析类型
- [x] 1.2 扩展 Java 与浏览器 WebSocket 的兼容协议类型

## 2. Runtime Inspection

- [x] 2.1 查询并归一 MCP、Plugin 与 Skill 目录
- [x] 2.2 在会话初始化和显式刷新时发布权威或降级快照
- [x] 2.3 补充目录解析、部分失败与旧协议兼容测试

## 3. Capability Tree

- [x] 3.1 实现 MCP 到 Tools 的可展开诊断树
- [x] 3.2 实现 Plugin 到 Skills 与独立 Skills 的版本诊断树
- [x] 3.3 完成加载、空数据、降级、错误和移动端状态

## 4. Verification

- [x] 4.1 执行 Sidecar、Java 与前端目标测试和类型检查
- [x] 4.2 执行 Forge Quality Gate 并记录实际检查器结果
- [ ] 4.3 在桌面与移动视口完成视觉与交互验收

## 5. Capability Provenance

- [x] 5.1 定义跨 Sidecar、Java 和浏览器的多来源证据契约
- [x] 5.2 归约 Forge 会话、Auth 全局、Plugin、项目本地和引擎内建来源
- [x] 5.3 在 MCP、Tool、Plugin 和 Skill 节点展示来源与作用域
- [x] 5.4 覆盖同名覆盖、未知来源和旧协议兼容测试
