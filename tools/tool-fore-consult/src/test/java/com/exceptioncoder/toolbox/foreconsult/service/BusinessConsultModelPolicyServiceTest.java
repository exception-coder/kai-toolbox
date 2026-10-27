package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.repository.BusinessConsultModelPolicyRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import com.exceptioncoder.toolbox.llm.spi.AgentAccountValidator;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BusinessConsultModelPolicyServiceTest {

    private final BusinessConsultModelPolicyRepository repository = mock(BusinessConsultModelPolicyRepository.class);
    private final CodexHomeDiscoveryService codexHomeDiscoveryService = mock(CodexHomeDiscoveryService.class);
    private final BusinessConsultModelPolicyService service =
            new BusinessConsultModelPolicyService(repository, codexHomeDiscoveryService);
    private final AgentAccountValidator validator = mock(AgentAccountValidator.class);

    @BeforeEach
    @SuppressWarnings("unchecked")
    void configureValidator() {
        var provider = mock(org.springframework.beans.factory.ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(validator);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "validators", provider);
        when(validator.validate(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AgentAccountValidator.Result(true, "VALID", "通过", 456L));
    }

    @AfterEach
    void clearAuthContext() {
        AuthContext.clear();
    }

    @Test
    void ordinaryUserAlwaysUsesConfiguredModel() {
        authenticate("USER");
        configured("current-sol-id", "GPT-5.6-Sol");

        assertThat(service.resolveForCurrentUser("gpt-6-astra")).isEqualTo("current-sol-id");
    }

    @Test
    void administratorCanSelectModelForOneConsultation() {
        authenticate("ADMIN");
        configured("current-sol-id", "GPT-5.6-Sol");

        assertThat(service.resolveForCurrentUser("gpt-6-astra")).isEqualTo("gpt-6-astra");
    }

    @Test
    void ordinaryUserReceivesRecoverableErrorBeforeConfiguration() {
        authenticate("USER");
        when(repository.find()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resolveForCurrentUser(null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("默认模型尚未配置");
    }

    @Test
    void savesCurrentCatalogIdentifierAndDisplayName() {
        authenticate("ADMIN");
        String codexHome = "C:\\Users\\zhang\\.codex-account-wz";
        var request = new BusinessConsultModelPolicyRequest("current-sol-id", "GPT-5.6-Sol", codexHome);
        when(codexHomeDiscoveryService.list()).thenReturn(List.of(codexHome));
        configured("current-sol-id", "GPT-5.6-Sol");

        var saved = service.save(request);

        assertThat(saved.model()).isEqualTo("current-sol-id");
        assertThat(saved.displayName()).isEqualTo("GPT-5.6-Sol");
        verify(repository).saveValidated(
                org.mockito.ArgumentMatchers.eq("current-sol-id"),
                org.mockito.ArgumentMatchers.eq("GPT-5.6-Sol"),
                org.mockito.ArgumentMatchers.eq(codexHome),
                org.mockito.ArgumentMatchers.eq("7"),
                org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void everyUserUsesConfiguredCodexHome() {
        authenticate("ADMIN");
        configured("current-sol-id", "GPT-5.6-Sol");

        assertThat(service.resolveCodexHome()).isEqualTo("C:\\Users\\zhang\\.codex-account-wz");
    }

    @Test
    void rejectsCodexHomeOutsideServerDiscovery() {
        authenticate("ADMIN");
        var request = new BusinessConsultModelPolicyRequest(
                "current-sol-id", "GPT-5.6-Sol", "C:\\Users\\zhang\\.codex-unknown");
        when(codexHomeDiscoveryService.list()).thenReturn(List.of("C:\\Users\\zhang\\.codex"));

        assertThatThrownBy(() -> service.save(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("不在当前服务可用目录中");
    }

    @Test
    void normalUserCannotChangeDefaultEvenWhenCallingServiceDirectly() {
        authenticate("USER");
        assertThatThrownBy(() -> service.save(new BusinessConsultModelPolicyRequest("model", "model", "home")))
                .hasMessageContaining("仅管理员");
        org.mockito.Mockito.verifyNoInteractions(validator);
    }

    @Test
    void failedProbePreservesExistingPolicyAndAuditsOnlyControlledResult() {
        authenticate("ADMIN");
        String home = java.nio.file.Path.of(System.getProperty("user.home"), ".codex-B").toString();
        when(codexHomeDiscoveryService.list()).thenReturn(List.of(home));
        configured("old", "旧模型");
        when(validator.validate(home, "model")).thenReturn(new AgentAccountValidator.Result(false, "AUTHORIZATION_FAILED", "工作区授权失败", 789L));
        assertThatThrownBy(() -> service.save(new BusinessConsultModelPolicyRequest("model", "模型", home)))
                .hasMessageContaining("原配置已保留");
        org.mockito.Mockito.verify(repository, org.mockito.Mockito.never()).saveValidated(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyLong());
        verify(repository).audit("7", "C:\\Users\\zhang\\.codex-account-wz", home, "model", "AUTHORIZATION_FAILED", 789L);
    }

    @Test
    void receivesRecoverableErrorBeforeCodexHomeConfiguration() {
        when(repository.find()).thenReturn(Optional.of(
                new BusinessConsultModelPolicyView("current-sol-id", "GPT-5.6-Sol", null, 123L)));

        assertThatThrownBy(service::resolveCodexHome)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("默认 Auth 目录尚未配置");
    }

    private void configured(String model, String displayName) {
        when(repository.find()).thenReturn(Optional.of(
                new BusinessConsultModelPolicyView(
                        model, displayName, "C:\\Users\\zhang\\.codex-account-wz", 123L)));
    }

    private static void authenticate(String role) {
        AuthContext.set(new AuthPrincipal(
                7L, "user", List.of(role), List.of(), "jti", System.currentTimeMillis() + 60_000));
    }
}
