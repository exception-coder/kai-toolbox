package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultRuntimePolicyProviderTest {
    private final ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
    private final ConsultTurnRepository turns = mock(ConsultTurnRepository.class);
    private final BusinessConsultModelPolicyService policy = mock(BusinessConsultModelPolicyService.class);
    private final ConsultRuntimePolicyProvider provider = new ConsultRuntimePolicyProvider(sessions, turns, policy, new ObjectMapper());

    @Test
    void policyIsResolvedAgainAtEveryCallRatherThanCreationTime() {
        var consultation = ConsultSession.builder().sessionId("c").userId("7").archiveStatus("PENDING")
                .questionTitle("咨询").systemName("ERP").model("original-model").codexHome("old").build();
        when(sessions.findByDevSessionId("s")).thenReturn(Optional.of(consultation));
        when(policy.get()).thenReturn(new BusinessConsultModelPolicyView("model", "模型", "B", 2L, 2, "VALID", 2L));
        assertThat(provider.resolve("s", 7L).orElseThrow().codexHome()).isEqualTo("B");
        assertThat(provider.resolve("s", 7L).orElseThrow().model()).isEqualTo("original-model");
        when(policy.get()).thenReturn(new BusinessConsultModelPolicyView("model", "模型", "C", 3L, 3, "VALID", 3L));
        assertThat(provider.resolve("s", 7L).orElseThrow().codexHome()).isEqualTo("C");
        assertThat(consultation.getCodexHome()).isEqualTo("old");
    }

    @Test
    void mismatchedOwnerCannotExecuteOrReadHistoryAndArchiveRemainsReadonly() {
        var consultation = ConsultSession.builder().sessionId("c").userId("7").archiveStatus("SUCCESS").build();
        when(sessions.findByDevSessionId("s")).thenReturn(Optional.of(consultation));
        assertThatThrownBy(() -> provider.resolve("s", 8L)).hasMessageContaining("归属不一致");
        assertThatThrownBy(() -> provider.savedHistory("s", 8L)).hasMessageContaining("归属不一致");
        assertThatThrownBy(() -> provider.resolve("s", 7L)).hasMessageContaining("已归档");
        assertThat(provider.savedHistory("s", 7L)).isPresent();
        verifyNoInteractions(policy);
    }
}
