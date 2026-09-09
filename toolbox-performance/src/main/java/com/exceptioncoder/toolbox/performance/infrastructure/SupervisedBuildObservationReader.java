package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.application.StartupBuildObservation;
import java.util.Properties;

/** 读取本次监督启动注入的标量，不读取磁盘、启动参数全集或敏感环境变量。 */
public final class SupervisedBuildObservationReader {

    private static final String PREFIX = "toolbox.performance.";
    private static final long MAX_BUILD_MILLIS = 24 * 60 * 60 * 1000L;

    private SupervisedBuildObservationReader() {
    }

    public static StartupBuildObservation read(Properties properties, long jvmStartedAt) {
        String scope = properties.getProperty(PREFIX + "build-scope", "");
        try {
            long startedAt = Long.parseLong(properties.getProperty(PREFIX + "build-started-at", ""));
            long preparation = jvmStartedAt - startedAt;
            if (startedAt <= 0 || preparation < 0 || preparation > MAX_BUILD_MILLIS) {
                return StartupBuildObservation.unmeasured();
            }
            if ("maven-before-jvm".equals(scope)) {
                return new StartupBuildObservation("COMPLETED", scope, preparation, null);
            }
            if ("maven-package".equals(scope)) {
                long duration = Long.parseLong(properties.getProperty(PREFIX + "build-duration-ms", ""));
                if (duration >= 0 && duration <= MAX_BUILD_MILLIS) {
                    return new StartupBuildObservation("COMPLETED", scope, duration, 0);
                }
            }
        } catch (NumberFormatException ignored) {
            // 无效观测不能阻断业务启动，也不能伪造零耗时。
        }
        return StartupBuildObservation.unmeasured();
    }
}
