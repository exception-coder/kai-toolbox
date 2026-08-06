package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DispatchConsultRequest(
        @NotBlank @Size(max = 4000) String question,
        @Size(max = 4000) String firstQuestion,
        Boolean forceFollowUp,
        @NotBlank @Pattern(regexp = "claude|codex") String engine
) {
}
