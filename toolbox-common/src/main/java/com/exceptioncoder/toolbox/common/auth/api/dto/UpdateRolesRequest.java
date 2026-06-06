package com.exceptioncoder.toolbox.common.auth.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

public record UpdateRolesRequest(@NotNull List<String> roles) {
}
