package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.List;

/**
 * One independently replaceable step in the business-consultation pipeline.
 * Adding a Spring bean that implements this interface automatically inserts it into the pipeline.
 */
public interface ConsultOrchestrationStep {

    String id();

    String label();

    int order();

    ConsultStepAvailability availability();

    default List<String> capabilityGaps() {
        return List.of();
    }

    void apply(ConsultOrchestrationContext context);
}
