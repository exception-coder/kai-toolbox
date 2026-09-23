package com.exceptioncoder.toolbox.foreconsult.api.dto;

/** Persisted runtime defaults used by new business consultations. */
public record BusinessConsultModelPolicyView(
        /** Current model identifier, or {@code null} before configuration. */
        String model,
        /** Catalog display name saved with the identifier. */
        String displayName,
        /** Administrator-selected Codex authorization directory. */
        String codexHome,
        /** Last configuration time in epoch milliseconds. */
        Long updatedAt
) {
}
