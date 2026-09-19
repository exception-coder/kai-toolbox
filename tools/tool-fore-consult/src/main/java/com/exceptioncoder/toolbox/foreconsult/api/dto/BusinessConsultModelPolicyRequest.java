package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Administrator-selected default model from the current Codex catalog. */
public record BusinessConsultModelPolicyRequest(
        /** Current model identifier returned by the catalog. */
        @NotBlank @Size(max = 100) String model,
        /** Current human-readable name returned by the catalog. */
        @NotBlank @Size(max = 100) String displayName
) {
}
