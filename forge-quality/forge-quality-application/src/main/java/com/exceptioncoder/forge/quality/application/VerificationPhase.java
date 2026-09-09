package com.exceptioncoder.forge.quality.application;

import java.util.Locale;

/** Supported Forge Verification execution phases. */
public enum VerificationPhase {
    /** Static checks only. */
    STATIC,
    /** Runtime scenarios only. */
    RUNTIME,
    /** Static checks followed by runtime scenarios after a static pass. */
    ALL;

    /** Parses an untrusted phase value. */
    public static VerificationPhase parse(String value) {
        if (value == null || value.isBlank()) {
            return ALL;
        }
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Phase must be static, runtime, or all");
        }
    }
}
