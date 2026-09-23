package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Administrator-selected business consultation runtime defaults. */
public record BusinessConsultModelPolicyRequest(
        /** Current model identifier returned by the catalog. */
        @NotBlank @Size(max = 100) String model,
        /** Current human-readable name returned by the catalog. */
        @NotBlank @Size(max = 100) String displayName,
        /** Codex authorization directory returned by server discovery. */
        @NotBlank @Size(max = 500) String codexHome
) {
}
