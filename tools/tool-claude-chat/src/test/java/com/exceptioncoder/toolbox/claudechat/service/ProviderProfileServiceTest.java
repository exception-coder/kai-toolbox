package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.ProviderController;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProviderProfileServiceTest {

    private ClaudeChatSettingRepository settings;
    private ProviderProfileService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE claude_chat_setting (
                    name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)
                """);
        settings = new ClaudeChatSettingRepository(jdbc);
        mapper = new ObjectMapper();
        service = new ProviderProfileService(settings, mapper);
    }

    @Test
    void savesProfilesInSqliteWithoutReturningKeys() throws Exception {
        var created = service.create(new ProviderProfileService.ProfileInput(
                "DeepSeek", "https://api.deepseek.com", "secret-key", "deepseek-flash"));

        assertThat(created.hasKey()).isTrue();
        assertThat(mapper.writeValueAsString(created)).doesNotContain("secret-key");
        assertThat(service.resolve(created.id()).key()).isEqualTo("secret-key");
        assertThatThrownBy(() -> service.resolve(created.id(), 999L))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new ProviderProfileService(settings, mapper).list()).containsExactly(created);

        var updated = service.update(created.id(), new ProviderProfileService.ProfileInput(
                "DeepSeek 2", "https://api.deepseek.com", "", "deepseek-v4-pro"));
        assertThat(updated.name()).isEqualTo("DeepSeek 2");
        assertThat(service.resolve(created.id()).key()).isEqualTo("secret-key");
        service.delete(created.id());
        assertThatThrownBy(() -> service.resolve(created.id())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void legacyImportIsIdempotentAndNeverOverwritesServerEdits() {
        var legacy = new ProviderProfileService.LegacyProfile(
                "p123-abc", "Original", "https://gateway.example", "old-key", "model-a");
        assertThat(service.importLegacy(List.of(legacy))).hasSize(1);
        service.update(legacy.id(), new ProviderProfileService.ProfileInput(
                "Edited", legacy.baseUrl(), "new-key", "model-b"));

        assertThat(service.importLegacy(List.of(legacy))).hasSize(1);
        assertThat(service.list().getFirst().name()).isEqualTo("Edited");
        assertThat(service.resolve(legacy.id()).key()).isEqualTo("new-key");
    }

    @Test
    void repeatedCreateRequestReusesSavedProfile() {
        var input = new ProviderProfileService.ProfileInput(
                "Gateway", "https://gateway.example", "key", "model-a");
        var first = service.create(input, "stable-request-id");
        var second = service.create(input, "stable-request-id");

        assertThat(second).isEqualTo(first);
        assertThat(service.list()).hasSize(1);
        assertThat(service.create(input, "another-request-id")).isEqualTo(first);
        assertThatThrownBy(() -> service.create(new ProviderProfileService.ProfileInput(
                "Gateway", "https://gateway.example", "different-key", "model-a"), "stable-request-id"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("请求 ID");
        assertThatThrownBy(() -> service.create(new ProviderProfileService.ProfileInput(
                "Gateway", "https://gateway.example", "different-key", "model-a"), "another-request-id"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("已存在");
    }

    @Test
    void invalidLegacyBatchDoesNotPersistPartialImport() {
        var valid = new ProviderProfileService.LegacyProfile("first", "Valid", "https://gateway.example", "key", "model");
        var invalid = new ProviderProfileService.LegacyProfile("bad/id", "Invalid", "https://gateway.example", "key", "model");

        assertThatThrownBy(() -> service.importLegacy(List.of(valid, invalid)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(service.list()).isEmpty();
    }

    @Test
    void profileModelLookupUsesServerKeyAndDeleteReturnsNoContent() {
        var profile = service.create(new ProviderProfileService.ProfileInput(
                "Gateway", "https://gateway.example", "server-secret", "model-a"));
        ProviderModelService models = mock(ProviderModelService.class);
        when(models.fetch(profile.baseUrl(), "server-secret"))
                .thenReturn(new ProviderModelService.FetchResult(List.of(), "catalog unavailable"));
        ProviderController controller = new ProviderController(models, service);

        var response = controller.models(new ProviderController.ModelsRequest(profile.id(), null, null));
        assertThat(response.error()).isEqualTo("catalog unavailable");
        verify(models).fetch(profile.baseUrl(), "server-secret");
        assertThat(controller.deleteProfile(profile.id()).getStatusCode().value()).isEqualTo(204);
    }

    @Test
    void websocketMessagesRemainCompatibleWithClientsWithoutProfileIds() throws Exception {
        ClientMessage.Open oldOpen = (ClientMessage.Open) mapper.readValue(
                "{\"type\":\"open\",\"cwd\":\"C:/work\",\"apiBaseUrl\":\"https://gateway.example\",\"authToken\":\"old-key\"}",
                ClientMessage.class);
        ClientMessage.SwitchProvider oldSwitch = (ClientMessage.SwitchProvider) mapper.readValue(
                "{\"type\":\"switchProvider\",\"apiBaseUrl\":\"https://gateway.example\",\"authToken\":\"old-key\"}",
                ClientMessage.class);
        ClientMessage.SwitchProvider byId = (ClientMessage.SwitchProvider) mapper.readValue(
                "{\"type\":\"switchProvider\",\"providerProfileId\":\"profile-1\"}", ClientMessage.class);

        assertThat(oldOpen.providerProfileId()).isNull();
        assertThat(oldSwitch.providerProfileId()).isNull();
        assertThat(byId.providerProfileId()).isEqualTo("profile-1");
    }
}
