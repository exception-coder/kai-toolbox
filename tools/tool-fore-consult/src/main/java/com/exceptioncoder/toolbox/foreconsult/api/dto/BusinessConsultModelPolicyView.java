package com.exceptioncoder.toolbox.foreconsult.api.dto;

/** Persisted default model used by ordinary business consultation users. */
public record BusinessConsultModelPolicyView(
        /** Current model identifier, or {@code null} before configuration. */
        String model,
        /** Catalog display name saved with the identifier. */
        String displayName,
        /** Last configuration time in epoch milliseconds. */
        Long updatedAt
) {
}
