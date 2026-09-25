package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionProviderCapabilitiesTest {
    @Test
    void onlyImplementedAdaptersAcceptSessionGateways() {
        for (String engine : new String[]{"claude", "codex", "pi", "copilot", "opencode"}) {
            assertTrue(SessionProviderCapabilities.supportsGateway(engine));
        }
        for (String engine : new String[]{"qwen", "trae", "antigravity", "unknown", ""}) {
            assertFalse(SessionProviderCapabilities.supportsGateway(engine));
        }
        assertFalse(SessionProviderCapabilities.supportsGateway(null));
    }
}
