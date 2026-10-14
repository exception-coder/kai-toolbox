## Context
RuntimeScenarioLoader 负责项目场景装载，RuntimeVerificationEngine 通过 ServiceLoader 路由；ForgeQualityGateAdapter 调用同一 CLI。复用现有两阶段门禁，不另建监督调度。

## Decisions
MavenTestPlan 只接受仓库内模块、测试名称与有界超时，固定 test 目标；定位当前 JVM 和受信任已安装 Maven，以 argv 直接启动，不使用 Shell。SurefireEvidence 校验新报告的 tests/failures/errors/skipped；退出非零、超时、旧报告或零执行必须失败。报告通过 Surefire 的 reportNameSuffix 加入本次唯一标识，仅读取指定模块的 target/surefire-reports；每个指定模块必须实际运行测试。项目可配置本地 H2 回归；不将其等价于目标数据库验收。Maven 构建本身可以执行项目插件和测试，配置作者须选择本地用例；验证器不宣称沙箱或系统级 Docker 隔离。

配置装载提供受控项目路径，不能通过 YAML 指向其他工作区。提供单进程超时清理，测试输出写临时文件防止管道阻塞，完成后清理本验证创建的临时结果。

本地验收固定关闭 Maven build-cache，避免构建缓存跳过测试却返回成功。保留每轮唯一后缀报告，只有实际测试输出能够满足门禁。

## Verification
单测覆盖成功、失败、跳过、陈旧报告、超时及路径越界；CLI 装配后对 Yoooni One 实际执行本地组织模块测试。生产项保持未执行。新后端运行验收需另行重启授权。

## Rollback
撤回 maven-test 配置和验证器注册；不修改业务数据、任务勾选或生产记录。
