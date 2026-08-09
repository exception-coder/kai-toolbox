package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CodexModelCatalogServiceTest {

    @TempDir
    Path userHome;

    private final CodexModelCatalogService service = new CodexModelCatalogService(new ObjectMapper());

    @Test
    void loadsTheSameSelectableModelFieldsUsedByVibeCoding() throws Exception {
        Path codexHome = Files.createDirectory(userHome.resolve(".codex-account-yx"));
        Files.writeString(codexHome.resolve("models_cache.json"), """
                {
                  "models": [
                    {
                      "slug": "gpt-5.6-codex",
                      "display_name": "GPT-5.6 Codex",
                      "description": "Coding model",
                      "visibility": "list",
                      "supported_in_api": true,
                      "default_reasoning_level": "medium",
                      "supported_reasoning_levels": [
                        {"effort": "low"},
                        {"effort": "medium"},
                        {"effort": "INVALID VALUE"}
                      ],
                      "additional_speed_tiers": ["fast"]
                    },
                    {
                      "slug": "gpt-5.3-codex-spark",
                      "display_name": "GPT-5.3-Codex-Spark",
                      "description": "Ultra-fast coding model.",
                      "visibility": "list",
                      "supported_in_api": false,
                      "default_reasoning_level": "high",
                      "supported_reasoning_levels": [{"effort": "high"}]
                    },
                    {"slug": "hidden-model", "visibility": "hide"}
                  ]
                }
                """);

        var models = service.list(userHome, codexHome);

        assertThat(models).hasSize(2);
        assertThat(models.getFirst().value()).isEqualTo("gpt-5.6-codex");
        assertThat(models.getFirst().displayName()).isEqualTo("GPT-5.6 Codex");
        assertThat(models.getFirst().reasoningEfforts()).containsExactly("low", "medium");
        assertThat(models.getFirst().defaultReasoningEffort()).isEqualTo("medium");
        assertThat(models.getFirst().fastSupported()).isTrue();
        assertThat(models.get(1).value()).isEqualTo("gpt-5.3-codex-spark");
        assertThat(models.get(1).reasoningEfforts()).containsExactly("high");
    }

    @Test
    void rejectsDirectoriesOutsideTheRuntimeUserHome() throws Exception {
        Path outsideHome = Files.createDirectory(userHome.resolve("outside"));
        Path codexHome = Files.createDirectory(outsideHome.resolve(".codex"));

        assertThatThrownBy(() -> service.list(userHome, codexHome))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Codex 授权目录不合法");
    }

    @Test
    void returnsEmptyListWhenModelCacheDoesNotExist() throws Exception {
        Path codexHome = Files.createDirectory(userHome.resolve(".codex"));

        assertThat(service.list(userHome, codexHome)).isEmpty();
    }
}
