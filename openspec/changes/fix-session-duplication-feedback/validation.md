# 会话复制反馈验证

2026-10-12，开发基线 `1e3382b1`；仅覆盖本次会话复制修复。后端新行为尚未加载到运行服务，不将下列证据计作新版运行交付。

## 原因与实现

普通复制原先也使用源会话的 Auth 链路。同目录的唯一关联已由源会话占用，新副本插入后关联失败，会被删除并返回源会话；前端等待不同于源 ID 的 Ready，最终超时。菜单关闭后复制状态消失；最近会话未传入复制动作。

普通复制明确传 `reuseAuthSession=false`，独立链路并继承源 Auth；携带交接包的 Auth 切换传 true，沿用已有链路复用。旧消息缺省继续兼容旧语义。进度弹窗独立于列表，成功以新目标 Ready 确认，未知结果提示先检查列表；已发送的复制不随断线重发。

## 检查结果

| 范围 | 实际结果 |
| --- | --- |
| 前端定向回归 | 26 项通过：消息 hook 8、项目会话列表 10、最近会话 6、进度弹窗 2；未执行全套前端测试 |
| 后端定向回归 | 11 项通过：复制 service 3、消息契约 7、Auth 关联 repository 1；使用 mock Sidecar，无模型调用 |
| 类型与边界 | `npm run typecheck` 通过，菜单目录与 feature 边界检查通过 |
| 前端构建 | 直接 Vite 构建到独立 `dist/session-duplication-build` 成功；存在既有大 chunk 警告 |
| 宿主装配 | Java 21，`mvn -pl toolbox-starter -am -DskipTests -Dskip.frontend=true package` 成功；宿主全量测试未运行，静态前端不重新嵌入 |
| 规格 | `openspec validate fix-session-duplication-feedback --strict --no-interactive` 通过 |
| Forge 门禁 | CLI `verify all` JSON `PASSED` 且退出码 0；`executedCheckers=[]`，实际执行 9 项已有只读 API 场景；不是本修复新版业务验收 |
| 浏览器隔离界面 | 实际 RecentSessions / SessionList / 进度弹窗，模拟完成响应；点击立即显示、成功确认及恢复草稿焦点通过；360px 下弹窗宽 331px、左右边界均在视口内，未知结果提示可关闭 |
| 全屏 | 全屏 Portal 与 Esc 边界定向测试通过；浏览器自动化调用原生 Fullscreen API 被浏览器拒绝，原生全屏浏览器验证未覆盖 |

初次后端测试受默认 JAVA_HOME 旧版本影响；改用本机 Microsoft JDK 21 后通过。初次宿主打包默认触发本地助手 SDK 脚本，已停止该构建路径并改用 `skip.frontend`：重复生成已有 `sha256-48d810f67b65` 内容（目录早于本任务已存在），刷新了本地发布元数据；未推送或重启服务，SDK 产物未纳入提交。前端锁文件没有改动。

## 运行与交付边界

通过既有 Vite 前端热更新加载界面修改；后端仍为本轮开始时的运行实例。Forge 状态起止后台 PID 49552、前端 PID 28140，均 ready，重启次数保持 0。没有执行重启、发送模型请求、复制真实用户会话、修改数据库结构或登记人工 SQL。

待用户明确确认本次后端重启后，验收真实复制、关联落库及不同引擎运行行为，并按仓库规则观察至少 60 秒。原生全屏真实浏览器验收仍待补；不会因单元测试通过而提前标记这些项完成。其他工作区修改及暂存内容保留，本任务不推送。
