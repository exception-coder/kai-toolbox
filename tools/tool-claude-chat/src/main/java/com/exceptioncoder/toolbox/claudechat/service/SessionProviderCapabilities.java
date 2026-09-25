package com.exceptioncoder.toolbox.claudechat.service;

import java.util.Set;

/** 已实现会话级凭据覆盖的引擎；不以原生引擎可用性推断网关能力。 */
final class SessionProviderCapabilities {
    private static final Set<String> GATEWAY_ENGINES = Set.of("claude", "codex", "pi", "copilot", "opencode");

    private SessionProviderCapabilities() { }

    static boolean supportsGateway(String engine) {
        return engine != null && GATEWAY_ENGINES.contains(engine);
    }
}
