package com.exceptioncoder.forge.quality.core;

/** Final status of a quality run. */
public enum GateStatus {
    /** No blocking findings were produced. */
    PASSED,
    /** At least one blocking finding was produced. */
    FAILED
}
