package com.exceptioncoder.toolbox.performance.infrastructure;

import org.junit.jupiter.api.Test;
import java.util.Properties;
import static org.assertj.core.api.Assertions.assertThat;

/** 验证开发与打包时钟口径、无效数据及未知状态。 */
class SupervisedBuildObservationReaderTest {

    @Test
    void measuresPreparationUntilJvmStartWithoutInventingMavenExit() {
        var properties = properties("maven-before-jvm");
        var result = SupervisedBuildObservationReader.read(properties, 3500);
        assertThat(result.durationMs()).isEqualTo(2500);
        assertThat(result.scope()).isEqualTo("maven-before-jvm");
        assertThat(result.exitCode()).isNull();
    }

    @Test
    void usesStopwatchDurationForPackageRatherThanTimeUntilJvm() {
        var properties = properties("maven-package");
        properties.setProperty("toolbox.performance.build-duration-ms", "1234");
        var result = SupervisedBuildObservationReader.read(properties, 3500);
        assertThat(result.durationMs()).isEqualTo(1234);
        assertThat(result.exitCode()).isZero();
    }

    @Test
    void rejectsMissingMalformedFutureAndUnboundedEvidence() {
        assertThat(SupervisedBuildObservationReader.read(new Properties(), 3500).durationMs()).isNull();
        assertThat(SupervisedBuildObservationReader.read(properties("unknown"), 3500).status())
                .isEqualTo("NOT_MEASURED");
        assertThat(SupervisedBuildObservationReader.read(properties("maven-before-jvm"), 500).durationMs()).isNull();
        assertThat(SupervisedBuildObservationReader.read(properties("maven-before-jvm"), 100_000_000).durationMs())
                .isNull();
        var invalid = properties("maven-package");
        invalid.setProperty("toolbox.performance.build-duration-ms", "not-a-number");
        assertThat(SupervisedBuildObservationReader.read(invalid, 3500).durationMs()).isNull();
    }

    private Properties properties(String scope) {
        var properties = new Properties();
        properties.setProperty("toolbox.performance.build-scope", scope);
        properties.setProperty("toolbox.performance.build-started-at", "1000");
        return properties;
    }
}
