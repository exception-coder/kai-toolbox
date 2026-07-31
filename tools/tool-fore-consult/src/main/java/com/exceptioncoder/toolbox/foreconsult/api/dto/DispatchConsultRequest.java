package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DispatchConsultRequest(
        @NotBlank @Size(max = 4000) String question,
        @Size(max = 4000) String firstQuestion,
        Boolean forceFollowUp
) {
}
