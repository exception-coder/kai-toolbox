package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.time.Instant;
import java.util.List;

public record DomainKnowledgeStatus(
        RegistrationState state,
        int totalModules,
        int coveredModules,
        List<ModuleGap> gaps,
        Instant checkedAt
) {
}
