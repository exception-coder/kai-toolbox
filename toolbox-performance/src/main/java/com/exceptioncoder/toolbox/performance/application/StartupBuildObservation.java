package com.exceptioncoder.toolbox.performance.application;

/** 监督启动的构建观测；时钟与运行里程碑独立，范围明确区分打包和 JVM 前准备。 */
public record StartupBuildObservation(
        /** COMPLETED 或 NOT_MEASURED。 */
        String status,
        /** maven-package、maven-before-jvm 或 unknown。 */
        String scope,
        /** 对应范围的耗时毫秒；未测量保持 null。 */
        Long durationMs,
        /** 完成打包时为 0，开发准备阶段未取得 Maven 退出码。 */
        Integer exitCode) {

    public static StartupBuildObservation unmeasured() {
        return new StartupBuildObservation("NOT_MEASURED", "unknown", null, null);
    }
}
