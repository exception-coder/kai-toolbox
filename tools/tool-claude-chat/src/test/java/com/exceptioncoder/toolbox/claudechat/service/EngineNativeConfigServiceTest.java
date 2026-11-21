package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.ApplyRequest;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.ApplyResult;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.EngineConfigView;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.Locations;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EngineNativeConfigServiceTest {

    private static final String KEY = "sk-test-0123456789abcd";
    private static final List<String> ALL = List.of("qwen", "opencode", "pi", "hermes", "zcode", "deepseekHarness");
    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path home;
    private Locations locations;
    private EngineNativeConfigService service;

    @BeforeEach
    void setUp() {
        locations = new Locations(home.resolve("qwen/settings.json"), home.resolve("oc-data/auth.json"),
                home.resolve("oc-config/opencode.json"), home.resolve("pi/auth.json"), home.resolve("pi/settings.json"),
                home.resolve("hermes/.env"), home.resolve("hermes/config.yaml"),
                home.resolve("zcode/provider_config.json"), home.resolve("dsh/.credentials.yaml"));
        service = new EngineNativeConfigService(mapper, locations);
    }

    @Test
    void deepseekIsWrittenToEveryNativeConfigAndReadBackWithoutExposingTheKey() throws Exception {
        ApplyResult result = service.apply(new ApplyRequest(ALL, "deepseek", null, KEY, "deepseek-v4-pro"));

        assertThat(result.failures()).isEmpty();
        assertThat(result.applied()).containsExactlyElementsOf(ALL);
        for (EngineConfigView view : result.engines()) {
            assertThat(view.configured()).as(view.engine()).isTrue();
            assertThat(view.provider()).as(view.engine()).isEqualTo("deepseek");
            assertThat(view.keyHint()).as(view.engine()).isEqualTo("…abcd");
        }
        assertThat(mapper.writeValueAsString(result)).doesNotContain(KEY);

        JsonNode qwen = mapper.readTree(locations.qwenSettings().toFile());
        assertThat(qwen.at("/security/auth/selectedType").asText()).isEqualTo("openai");
        assertThat(qwen.at("/env/DEEPSEEK_API_KEY").asText()).isEqualTo(KEY);
        assertThat(qwen.at("/model/name").asText()).isEqualTo("deepseek-v4-pro");
        assertThat(mapper.readTree(locations.opencodeConfig().toFile()).path("model").asText()).isEqualTo("deepseek/deepseek-v4-pro");
        assertThat(mapper.readTree(locations.piAuth().toFile()).at("/deepseek/type").asText()).isEqualTo("api_key");
        assertThat(Files.readString(locations.hermesEnv())).contains("DEEPSEEK_API_KEY=" + KEY);
        assertThat(Files.readString(locations.dshCredentials())).contains("DEEPSEEK_API_KEY: " + KEY);
    }

    @Test
    void blankKeyReusesTheSameServiceKeyFromAnotherEngineToSwitchModelOnly() throws Exception {
        Files.createDirectories(locations.dshCredentials().getParent());
        Files.writeString(locations.dshCredentials(), "version: 1\nrefs:\n  DEEPSEEK_API_KEY: " + KEY + "\n");

        ApplyResult result = service.apply(new ApplyRequest(List.of("qwen"), "deepseek", null, "", "deepseek-v4-flash"));

        assertThat(result.failures()).isEmpty();
        JsonNode qwen = mapper.readTree(locations.qwenSettings().toFile());
        assertThat(qwen.at("/env/DEEPSEEK_API_KEY").asText()).isEqualTo(KEY);
        assertThat(qwen.at("/model/name").asText()).isEqualTo("deepseek-v4-flash");
    }

    @Test
    void blankKeyNeverBorrowsAKeyFromADifferentService() {
        service.apply(new ApplyRequest(List.of("pi"), "deepseek", null, KEY, "deepseek-v4-pro"));

        ApplyResult result = service.apply(new ApplyRequest(List.of("qwen"), "openai-compatible",
                "https://llm.example.com/v1", null, "my-model"));

        assertThat(result.applied()).isEmpty();
        assertThat(result.failures()).singleElement().asString().contains("未找到可沿用的 Key");
    }

    @Test
    void customServiceIsRejectedPerEngineWhereOnlyDeepseekIsSupported() {
        ApplyResult result = service.apply(new ApplyRequest(List.of("opencode", "pi"), "openai-compatible",
                "https://llm.example.com/v1", KEY, "my-model"));

        assertThat(result.applied()).containsExactly("opencode");
        assertThat(result.failures()).singleElement().asString().startsWith("Pi").contains("仅支持 DeepSeek");
        EngineConfigView opencode = result.engines().stream().filter(view -> view.engine().equals("opencode")).findFirst().orElseThrow();
        assertThat(opencode.provider()).isEqualTo("openai-compatible");
        assertThat(opencode.baseUrl()).isEqualTo("https://llm.example.com/v1");
        assertThat(opencode.model()).isEqualTo("my-model");
    }

    @Test
    void hermesEditsOnlyTheModelBlockAndKeepsCommentsAndOtherSections() throws Exception {
        Files.createDirectories(locations.hermesConfig().getParent());
        String original = """
                # header
                model:
                  # Default model
                  default: "old-model"
                  provider: "auto"
                kanban:
                  review_dispatch: true
                stt:
                    model: "base"
                """;
        Files.writeString(locations.hermesConfig(), original);

        service.apply(new ApplyRequest(List.of("hermes"), "deepseek", null, KEY, "deepseek-v4-pro"));

        String updated = Files.readString(locations.hermesConfig());
        assertThat(updated).contains("# header", "  # Default model", "  default: \"deepseek-v4-pro\"",
                "  provider: \"deepseek\"", "  base_url: https://api.deepseek.com/v1", "kanban:\n  review_dispatch: true",
                "    model: \"base\"");
        assertThat(updated).doesNotContain("old-model");
        assertThat(Files.readString(locations.hermesConfig().resolveSibling("config.yaml.forge-bak"))).isEqualTo(original);
    }

    @Test
    void invalidInputIsRejectedBeforeAnyFileIsTouched() {
        assertThatThrownBy(() -> service.apply(new ApplyRequest(List.of(), "deepseek", null, KEY, "m")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.apply(new ApplyRequest(ALL, "deepseek", null, KEY, "bad model")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.apply(new ApplyRequest(ALL, "openai-compatible", "ftp://x", KEY, "m")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.apply(new ApplyRequest(ALL, "openai-compatible", "https://u:p@x.com", KEY, "m")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(home.toFile().list()).isEmpty();
    }

    @Test
    void unreadableConfigStillReturnsARowWithARecoveryNote() throws Exception {
        Files.createDirectories(locations.qwenSettings().getParent());
        Files.writeString(locations.qwenSettings(), "{ not json");

        EngineConfigView qwen = service.status().getFirst();

        assertThat(qwen.engine()).isEqualTo("qwen");
        assertThat(qwen.configured()).isFalse();
        assertThat(qwen.note()).contains("无法解析");
    }
}
