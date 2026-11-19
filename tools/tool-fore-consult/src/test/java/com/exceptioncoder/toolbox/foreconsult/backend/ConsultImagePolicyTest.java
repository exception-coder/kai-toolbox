package com.exceptioncoder.toolbox.foreconsult.backend;

import static org.assertj.core.api.Assertions.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

class ConsultImagePolicyTest {
    @Test void springLoadsExistingPropertyOverridesAndValidatesBudgets() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                    "toolbox.fore-consult.backend.images.app-bytes", "536870912",
                    "toolbox.fore-consult.backend.images.task-retention-hours", "72")));
            context.register(ConsultImagePolicy.class);
            context.refresh();
            var policy = context.getBean(ConsultImagePolicy.class);
            assertThat(policy.appBytes()).isEqualTo(512L * 1024 * 1024);
            assertThat(policy.globalBytes()).isEqualTo(1024L * 1024 * 1024);
            assertThat(policy.taskRetentionHours()).isEqualTo(72);
        }
        assertThatThrownBy(() -> new ConsultImagePolicy(20, 10, 2, 4, 2, 4, 48, 7)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConsultImagePolicy(10, 20, 2, 4, 2, 4, 168, 7)).isInstanceOf(IllegalArgumentException.class);
    }
}
