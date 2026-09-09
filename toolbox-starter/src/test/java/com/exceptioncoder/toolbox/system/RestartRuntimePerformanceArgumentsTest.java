package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** 接管启动不得重用上一 JVM 的构建计时及报告身份。 */
class RestartRuntimePerformanceArgumentsTest {

    @Test
    void removesPerformanceIdentityButPreservesOrdinaryRuntimeOptions() {
        assertThat(RestartRuntime.safeJvmInputArguments(List.of(
                "-Xmx512m", "-Dfile.encoding=UTF-8", "-Dtoolbox.performance.build-started-at=1000",
                "-Dtoolbox.performance.run-id=old", "-Dtoolbox.performance.report-path=old.json")))
                .containsExactly("-Xmx512m", "-Dfile.encoding=UTF-8");
    }
}
