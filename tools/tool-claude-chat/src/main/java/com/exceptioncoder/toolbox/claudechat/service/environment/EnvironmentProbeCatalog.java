package com.exceptioncoder.toolbox.claudechat.service.environment;

import java.util.List;

/** 固定版本命令白名单；浏览器不能提供命令或参数。 */
public final class EnvironmentProbeCatalog {
    public static final List<String> IDS = List.of("git", "node", "npm", "python", "uv", "claude",
            "codex", "graphify", "openspec", "java", "mvn");
    public static final int CONCURRENCY = 4;
    public static final int TIMEOUT_SECONDS = 10;

    private EnvironmentProbeCatalog() {
    }
}
