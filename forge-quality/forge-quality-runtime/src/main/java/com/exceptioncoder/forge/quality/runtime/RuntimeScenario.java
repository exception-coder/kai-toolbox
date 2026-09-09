package com.exceptioncoder.forge.quality.runtime;

import java.util.Map;

/** A project-owned runtime verification scenario. */
public record RuntimeScenario(String id, String type, Map<String, Object> configuration) {
    /** Validates identity and makes configuration immutable. */
    public RuntimeScenario {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Runtime scenario id must not be blank");
        }
        if (type == null || type.isBlank()) {
            throw new IllegalArgumentException("Runtime scenario type must not be blank");
        }
        configuration = Map.copyOf(configuration);
    }
}
