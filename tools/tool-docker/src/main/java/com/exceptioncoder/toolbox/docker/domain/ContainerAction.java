package com.exceptioncoder.toolbox.docker.domain;

import java.util.Arrays;

/** 容器维度白名单动作。任何不在此枚举的动作一律拒绝。 */
public enum ContainerAction {
    START("start"),
    STOP("stop"),
    RESTART("restart"),
    PAUSE("pause"),
    UNPAUSE("unpause"),
    KILL("kill");

    private final String cli;

    ContainerAction(String cli) {
        this.cli = cli;
    }

    public String cli() {
        return cli;
    }

    public static ContainerAction parse(String raw) {
        if (raw == null) throw new IllegalArgumentException("action is required");
        return Arrays.stream(values())
                .filter(a -> a.cli.equalsIgnoreCase(raw))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unsupported container action: " + raw));
    }
}
