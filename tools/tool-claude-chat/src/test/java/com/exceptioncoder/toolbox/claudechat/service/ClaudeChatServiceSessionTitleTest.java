package com.exceptioncoder.toolbox.claudechat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ClaudeChatServiceSessionTitleTest {

    @Test
    void preservesNewEngineIdentitiesAtTheSessionBoundary() {
        for (String engine : new String[]{"pi", "copilot"}) {
            String normalized = ReflectionTestUtils.invokeMethod(ClaudeChatService.class, "normalizeEngine", engine);
            assertThat(normalized).isEqualTo(engine);
        }
    }

    @Test
    void normalizesOptionalTitleWithoutChangingEmptySessionBehavior() {
        assertThat(ClaudeChatService.normalizeNewSessionTitle(null)).isNull();
        assertThat(ClaudeChatService.normalizeNewSessionTitle("  ")).isNull();
        assertThat(ClaudeChatService.normalizeNewSessionTitle("  报价流程优化  ")).isEqualTo("报价流程优化");
    }

    @Test
    void rejectsOversizedTitle() {
        assertThatThrownBy(() -> ClaudeChatService.normalizeNewSessionTitle("a".repeat(201)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
