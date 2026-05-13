package com.exceptioncoder.toolbox.webterm.api.dto;

import jakarta.validation.constraints.NotBlank;

public record RegisterClaudeSessionRequest(
        @NotBlank String cwd,
        @NotBlank String shell,
        String title
) {
}
