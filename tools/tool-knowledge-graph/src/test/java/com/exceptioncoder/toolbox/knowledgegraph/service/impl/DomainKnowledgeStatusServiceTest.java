package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.config.KnowledgeGraphProperties;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class DomainKnowledgeStatusServiceTest {
    @Test
    void bothRetiredSourcesReturnGoneWithoutStartingAnyEngine() {
        var props = new KnowledgeGraphProperties();
        assertEquals("", props.getDomainKnowledgeRepoPath());
        assertEquals("", props.getCrossTopologyRepoPath());
        var service = new DomainKnowledgeStatusServiceImpl();
        for (GraphRepo repo : GraphRepo.values()) {
            var error = assertThrows(ResponseStatusException.class,
                    () -> service.detectStatus("missing-project", repo));
            assertEquals(410, error.getStatusCode().value());
        }
    }
}
