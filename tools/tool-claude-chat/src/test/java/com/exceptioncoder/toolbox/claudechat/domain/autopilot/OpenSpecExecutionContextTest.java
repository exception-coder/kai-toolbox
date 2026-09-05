package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenSpecExecutionContextTest {

    @Test
    void requiresTaskKeyAndApplyOrdinalTogether() {
        assertThatThrownBy(() -> context("6.4", null, OpenSpecExecutionPhase.APPLY))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("同时存在");
    }

    @Test
    void refusesBackwardPhaseTransition() {
        OpenSpecExecutionContext context = context(null, null, OpenSpecExecutionPhase.QUALITY_GATE);

        assertThatThrownBy(() -> context.advance(OpenSpecExecutionPhase.VERIFY, "next"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("逆向");
    }

    @Test
    void preservesHumanTaskAndOrdinalAsSeparateIdentity() {
        OpenSpecExecutionContext context = context(null, null, OpenSpecExecutionPhase.APPLY)
                .withTask("6.4", 28, "revision-2");

        assertThat(context.currentTaskId()).isEqualTo("6.4");
        assertThat(context.currentTaskOrdinal()).isEqualTo(28);
        assertThat(context.version()).isEqualTo(2);
    }

    private OpenSpecExecutionContext context(String taskId, Integer ordinal, OpenSpecExecutionPhase phase) {
        return new OpenSpecExecutionContext("D:/repo", "D:/repo", "main", "workspace",
                "session-autopilot", "revision", taskId, ordinal, phase, "agent", 1, 1);
    }
}
