package com.exceptioncoder.toolbox.common.scheduling;

/** Defines how a managed task behaves when its previous execution is still running. */
public enum ConcurrentExecutionPolicy {
    SKIP_IF_RUNNING,
    ALLOW
}
