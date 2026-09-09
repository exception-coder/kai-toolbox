package com.exceptioncoder.toolbox.performance.domain;

/** 一次启动里程碑；elapsedMs 相对 JVM 启动，未知时间保持 null。 */
public record StartupObservation(
        /** COMPLETED、PENDING、FAILED、SKIPPED 或 NOT_OBSERVED。 */
        String status,
        /** JVM uptime 毫秒，不与其他里程碑相加。 */
        Long elapsedMs,
        /** 不含凭据的来源说明或路由模板。 */
        String source) {
}
