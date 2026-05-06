package com.exceptioncoder.toolbox.mediaparser.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ParseRequest(@NotBlank String url) {
}
