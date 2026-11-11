package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClaudeModelOptionsValidationTest {
    private static ModelInfo model(String id, boolean defaultModel, Boolean supportsEffort, List<String> levels) {
        return new ModelInfo(id, id, "", List.of(), null, false, defaultModel, supportsEffort, levels, null);
    }

    @Test
    void catalogChangesRejectExplicitlyUnsupportedSettingsBeforeDispatch() {
        var smaller = model("small", true, true, List.of("low", "high"));
        assertThatThrownBy(() -> ClaudeChatService.validateClaudeOptions(List.of(smaller), null,
                new ClaudeSessionOptions("max", false)))
                .isInstanceOf(ClaudeChatService.ClaudeOptionsMismatchException.class).hasMessageContaining("本次未发送");
        assertThatCode(() -> ClaudeChatService.validateClaudeOptions(List.of(smaller), "small",
                new ClaudeSessionOptions("auto", true))).doesNotThrowAnyException();
    }

    @Test
    void unknownCapabilitiesAndUntouchedSessionsAreNotTreatedAsUnsupported() {
        var unknown = model("unknown", false, null, List.of());
        assertThatCode(() -> ClaudeChatService.validateClaudeOptions(List.of(unknown), "unknown",
                new ClaudeSessionOptions("max", true))).doesNotThrowAnyException();
        assertThatCode(() -> ClaudeChatService.validateClaudeOptions(List.of(), "missing",
                new ClaudeSessionOptions("max", true))).doesNotThrowAnyException();
        assertThatCode(() -> ClaudeChatService.validateClaudeOptions(List.of(model("small", true, false, List.of())),
                "small", null)).doesNotThrowAnyException();
    }
}
