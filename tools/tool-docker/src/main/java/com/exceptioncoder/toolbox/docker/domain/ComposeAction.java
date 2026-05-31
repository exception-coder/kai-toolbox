package com.exceptioncoder.toolbox.docker.domain;

import java.util.Arrays;

/** docker compose 维度白名单动作。 */
public enum ComposeAction {
    UP("up"),
    DOWN("down"),
    RESTART("restart"),
    PULL("pull");

    private final String cli;

    ComposeAction(String cli) {
        this.cli = cli;
    }

    public String cli() {
        return cli;
    }

    public static ComposeAction parse(String raw) {
        if (raw == null) throw new IllegalArgumentException("action is required");
        return Arrays.stream(values())
                .filter(a -> a.cli.equalsIgnoreCase(raw))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unsupported compose action: " + raw));
    }
}
