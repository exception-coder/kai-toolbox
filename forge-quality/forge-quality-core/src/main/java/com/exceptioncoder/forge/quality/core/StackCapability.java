package com.exceptioncoder.forge.quality.core;

import java.util.List;

/** A detected project capability and the file evidence supporting it. */
public record StackCapability(String id, String displayName, List<String> evidence) {
    /** Creates an immutable capability. */
    public StackCapability {
        id = requireText(id, "id");
        displayName = requireText(displayName, "displayName");
        evidence = List.copyOf(evidence);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value;
    }
}
