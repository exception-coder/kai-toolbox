package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AgentGovernanceCatalogTest {

    @Test
    void exposesExactlyTwoRequirementEngineeringAgents() {
        assertThat(AgentGovernanceCatalog.capabilities(AgentGovernanceCatalog.REQUIREMENT_SPECIFICATION))
                .extracting(AgentCapability::name)
                .contains("graphify", "openspec");
        assertThat(AgentGovernanceCatalog.capabilities(AgentGovernanceCatalog.REQUIREMENT_PROGRESS))
                .extracting(AgentCapability::name)
                .contains("graphify", "source_read");
    }

    @Test
    void rejectsUnknownAgentInsteadOfFallingBackToBusinessConsult() {
        assertThatThrownBy(() -> AgentGovernanceCatalog.capabilities("unknown"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("未登记的 Agent");
    }
}
