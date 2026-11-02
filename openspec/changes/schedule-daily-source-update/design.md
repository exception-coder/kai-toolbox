# 每日主分支自动更新

目标是在每天北京时间 00:00 检查 origin/main，安全更新后复用 Forge 重载。L2：只改变既有更新器的触发时机，Git 安全分类、独立候选构建、排空与接管协议不变。不新增 OS 任务、第二个 Git 更新器或起停脚本。

默认 daily，以 Spring 六段 cron 与显式时区触发一次，开启一小时重试窗口。原固定延迟调度仅在窗口内工作；保留两分钟稳定观察、失败退避及最终复核。没有更新立即关闭窗口；dirty/ahead/diverged、网络或构建失败等在窗口内延期重试。窗口限制新检查，已开始的单轮操作仍完成。停机不补跑；重启遗留计划也只在下一窗口或人工触发时恢复。interval 显式保留旧行为。配置非法启动失败，不能悄悄改为全天更新。

人工立即检查仍走同一流程，并开启有限窗口。状态接口兼容增加 scheduleMode、cron、zone；nextCheck 表示下次计划检查。系统单用户且复用既有认证入口，没有新增 UI、导航、对话框或 AI 工作流，因此不涉及产品哲学中的对象交互原则例外。

固定运行控制仍是 node forge.mjs；不修改 PM2、重启协议、自动修复或交付裁决。无人值守重启的授权与 Agent 当次重启确认分别处理，未得到明确例外授权前不得启用定时重启或以本需求推定本次部署重启已批准。

研究依据：已核对 [Spring 调度](https://docs.spring.io/spring-framework/reference/integration/scheduling.html) 的 cron/timezone 支持和 [Git pull](https://git-scm.com/docs/git-pull) 的 ff-only 行为；项目使用 Spring Boot 3.4.5/Spring 6，实际兼容性以宿主编译及定向测试为准。Graphify 2026-08-23 索引陈旧，本次更新链依据当前源码核实。
