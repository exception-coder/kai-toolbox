package com.exceptioncoder.toolbox.docker.domain;

/** compose 动作的可选参数，service 内部使用，前端传入。 */
public record ComposeOptions(boolean detach, boolean removeOrphans, String pullPolicy) {

    public static ComposeOptions defaults() {
        return new ComposeOptions(true, false, "missing");
    }

    public ComposeOptions {
        if (pullPolicy == null || pullPolicy.isBlank()) {
            pullPolicy = "missing";
        }
    }
}
