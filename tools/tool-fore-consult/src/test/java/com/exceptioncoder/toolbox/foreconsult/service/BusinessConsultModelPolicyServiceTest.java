package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.repository.BusinessConsultModelPolicyRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
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
    private final BusinessConsultModelPolicyService service =
            new BusinessConsultModelPolicyService(repository);

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
        var request = new BusinessConsultModelPolicyRequest("current-sol-id", "GPT-5.6-Sol");
        configured("current-sol-id", "GPT-5.6-Sol");

        var saved = service.save(request);

        assertThat(saved.model()).isEqualTo("current-sol-id");
        assertThat(saved.displayName()).isEqualTo("GPT-5.6-Sol");
        verify(repository).save(
                org.mockito.ArgumentMatchers.eq("current-sol-id"),
                org.mockito.ArgumentMatchers.eq("GPT-5.6-Sol"),
                org.mockito.ArgumentMatchers.anyLong());
    }

    private void configured(String model, String displayName) {
        when(repository.find()).thenReturn(Optional.of(
                new BusinessConsultModelPolicyView(model, displayName, 123L)));
    }

    private static void authenticate(String role) {
        AuthContext.set(new AuthPrincipal(
                7L, "user", List.of(role), List.of(), "jti", System.currentTimeMillis() + 60_000));
    }
}
