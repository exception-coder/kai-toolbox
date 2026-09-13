## 1. Implementation

- [x] 1.1 删除独立前后端模块与 Python 服务，移除构建和导航引用。
- [x] 1.2 移除启动及专属配置，备份并重置本机覆盖项。
- [x] 1.3 更新当前文档和生成菜单目录。

## 2. Verification

- [x] 2.1 验证运行配置、前端构建及后端构建。
- [x] 2.2 执行质量门禁和运行验收，观察至少 60 秒稳定性。
- [x] 2.3 核对范围并提交。

## 3. Verification Evidence

- 前端类型检查、生产构建、菜单目录检查通过；runtime 定向测试 6 项通过。
- Maven reactor install 通过（跳过 Java 测试，编译测试源码）；fat jar 无访客模块依赖，内嵌菜单目录不含访客分析。
- Forge Quality Gate 返回 PASSED，实际执行 9 项 API verifier；没有执行静态 checker。
- 重启后观察超过 60 秒，前后端进程身份和重启计数不变，后端 API 与前端 HTTPS 均可用，访客分析端口 9600 无监听。
- 认证后的配置中心无访客配置块，共享 LLM 网关保留；工具注册无访客模块，旧 API 返回 NoResourceFoundException。
- 本机备份：`C:/Users/zhang/.kai-toolbox/backups/visitor-retirement-1789262992`；清理 2 项数据库覆盖及 1 项本地密钥，9 张历史业务表记录数未变。
- 限制：原有异常处理把未找到的资源返回为 500；微信服务原有 wxautox4 安装失败仍存在；未进行浏览器视觉验收。
- 自动审批拒绝清空旧静态构建目录，旧缓存保留；已覆盖更新入口和菜单目录，源码与本次前端构建不含访客模块。
