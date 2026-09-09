package com.exceptioncoder.forge.quality.core;

/** Severity of a quality finding. */
public enum Severity {
    /** Informational evidence. */
    INFO,
    /** Review is recommended, but the gate remains passable. */
    WARNING,
    /** A blocking quality violation. */
    ERROR
}
