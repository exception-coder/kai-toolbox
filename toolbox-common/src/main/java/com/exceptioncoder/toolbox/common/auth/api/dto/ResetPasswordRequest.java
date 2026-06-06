package com.exceptioncoder.toolbox.common.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ResetPasswordRequest(@NotBlank String newPassword) {
}
