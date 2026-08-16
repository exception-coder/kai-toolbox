package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LegacyGeminiSessionMigrationTest {

    @Test
    void migratesOfficialGeminiAndPreservesItsNativeHandle() {
        LegacyGeminiSessionMigration.Plan plan = LegacyGeminiSessionMigration.plan(
                "gemini", "gemini-session", Map.of());

        assertThat(plan.required()).isTrue();
        assertThat(plan.targetSessionId()).isNull();
        assertThat(plan.engineSessions()).containsEntry("gemini", "gemini-session");
    }

    @Test
    void resumesExistingAntigravityHandleWhenAvailable() {
        LegacyGeminiSessionMigration.Plan plan = LegacyGeminiSessionMigration.plan(
                "gemini", "gemini-session", Map.of("antigravity", "agy-conversation"));

        assertThat(plan.required()).isTrue();
        assertThat(plan.targetSessionId()).isEqualTo("agy-conversation");
    }

    @Test
    void migratesEveryLegacyGeminiChannelAndIgnoresOtherEngines() {
        assertThat(LegacyGeminiSessionMigration.plan(
                "gemini", "gemini-session", Map.of()).required()).isTrue();
        assertThat(LegacyGeminiSessionMigration.plan(
                "codex", "codex-session", Map.of()).required()).isFalse();
    }
}
