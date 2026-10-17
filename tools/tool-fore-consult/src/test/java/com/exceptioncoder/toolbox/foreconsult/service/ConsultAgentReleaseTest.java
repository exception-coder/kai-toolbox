package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentVersion;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 咨询允许未评测发布，不扩展到其他Agent。 */
class ConsultAgentReleaseTest {
    @Test
    void releasesUnevaluatedConsultCandidateWithoutInventingEvaluation() {
        var repository = mock(ConsultAgentManagementRepository.class);
        var service = new ConsultAgentManagementService(repository, mock(BusinessConsultSmokeSampleSource.class));
        var candidate = candidate();
        when(repository.findVersion("business-consult", 2)).thenReturn(Optional.of(candidate));
        when(repository.findVersions("business-consult")).thenReturn(List.of(candidate));
        when(repository.findDefinition("business-consult")).thenReturn(
                new ConsultAgentManagementRepository.AgentDefinition(
                        "business-consult", "咨询", "Forge", "", "", "Java", null));

        assertThat(service.getSnapshot().releaseGate().releasable()).isTrue();
        service.release(2);
        verify(repository).promote(eq("business-consult"), eq(2L), eq("RELEASE"), anyLong());
        assertThat(candidate.evaluationRunId()).isNull();
        assertThat(candidate.evaluationPassed()).isFalse();
    }

    @Test
    void keepsEvaluationRequiredForOtherAgents() {
        var repository = mock(ConsultAgentManagementRepository.class);
        var service = new ConsultAgentManagementService(repository, mock(BusinessConsultSmokeSampleSource.class));
        when(repository.findVersion("requirement-progress", 2)).thenReturn(Optional.of(candidate()));
        assertThatThrownBy(() -> service.release("requirement-progress", 2))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("尚未关联确定性评测");
    }

    private AgentVersion candidate() {
        return new AgentVersion(2, "CANDIDATE", "runtime-default", 0.1, "consult", "v4",
                List.of(), List.of(), List.of(), null, null, false, 0, null);
    }
}
