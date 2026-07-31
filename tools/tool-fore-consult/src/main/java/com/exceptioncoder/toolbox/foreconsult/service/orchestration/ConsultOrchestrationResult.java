package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.List;

public record ConsultOrchestrationResult(
        String pipelineVersion,
        String prompt,
        List<StepTrace> steps,
        List<String> capabilityGaps
) {
    public record StepTrace(
            String id,
            String label,
            ConsultStepAvailability availability
    ) {
    }
}
