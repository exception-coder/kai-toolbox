package com.exceptioncoder.toolbox.common.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record CreateUserRequest(
        @NotBlank String username,
        @NotBlank String password,
        List<String> roles
) {
}
