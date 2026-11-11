package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SessionSettingsNormalizerTest {

    @Test
    void permissionModeFallsBackToDefault() {
        assertThat(SessionSettingsNormalizer.normalizeMode("plan")).isEqualTo("plan");
        assertThat(SessionSettingsNormalizer.normalizeMode("unknown")).isEqualTo("default");
        assertThat(SessionSettingsNormalizer.normalizeMode(null)).isEqualTo("default");
        assertThat(SessionSettingsNormalizer.persistedMode(ClaudeChatSession.builder().permissionMode("acceptEdits").build()))
                .isEqualTo("acceptEdits");
    }

    @Test
    void engineNormalizationKeepsKnownEnginesAndMigratesGemini() {
        for (String engine : new String[]{"codex", "qwen", "trae", "antigravity", "opencode", "pi", "copilot", "deepseekHarness"}) {
            assertThat(SessionSettingsNormalizer.normalizeEngine(engine)).isEqualTo(engine);
        }
        assertThat(SessionSettingsNormalizer.normalizeEngine("gemini")).isEqualTo("antigravity");
        assertThat(SessionSettingsNormalizer.normalizeEngine("unknown")).isEqualTo("claude");
        assertThat(SessionSettingsNormalizer.normalizeEngine(null)).isEqualTo("claude");
    }

    @Test
    void engineHistoryReplacesGeminiAndKeepsOrder() {
        assertThat(SessionSettingsNormalizer.migrateEngineHistory("claude, gemini ,codex,gemini")).isEqualTo("claude,antigravity,codex");
        assertThat(SessionSettingsNormalizer.migrateEngineHistory(null)).isEqualTo("antigravity");
    }

    @Test
    void codexOptionsAndDuplicateTitle() {
        assertThat(SessionSettingsNormalizer.normalizeCodexReasoningEffort("high")).isEqualTo("high");
        assertThat(SessionSettingsNormalizer.normalizeCodexReasoningEffort("HIGH; rm")).isEqualTo("low");
        assertThat(SessionSettingsNormalizer.normalizeCodexSpeed("fast")).isEqualTo("fast");
        assertThat(SessionSettingsNormalizer.normalizeCodexSpeed("turbo")).isEqualTo("default");
        assertThat(SessionSettingsNormalizer.duplicateTitle("需求")).isEqualTo("需求（副本）");
        assertThat(SessionSettingsNormalizer.duplicateTitle("  ")).isNull();
    }
}
