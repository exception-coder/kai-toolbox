package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/** 教学成绩不能被客户端伪造成生产发布授权。 */
class TeachingAgentReleaseProtectionTest {
    @Test
    void rejectsGenericVersionWritesAndReleaseBeforeRepositoryAccess() {
        var repository = mock(ConsultAgentManagementRepository.class);
        var service = new ConsultAgentManagementService(repository, mock(BusinessConsultSmokeSampleSource.class));
        var command = new CreateAgentVersionCommand("test", 0.1, "test", "v1",
                List.of(), List.of(), List.of(), "fake", 100.0, true);
        assertThatThrownBy(() -> service.createCandidate(TeachingConfig.AGENT_ID, command))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.release(TeachingConfig.AGENT_ID, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.rollback(TeachingConfig.AGENT_ID, 1))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(repository);
    }
}
