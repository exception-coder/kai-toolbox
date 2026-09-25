package com.exceptioncoder.toolbox.claudechat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ClaudeChatServiceSessionTitleTest {

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
