package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.List;

public record ConsultOrchestrationResult(
        String pipelineVersion,
        String prompt,
        List<StepTrace> steps,
        List<String> capabilityGaps,
        com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository.Snapshot workflowSnapshot
) {
    public ConsultOrchestrationResult(String pipelineVersion, String prompt, List<StepTrace> steps,
                                      List<String> capabilityGaps) {
        this(pipelineVersion, prompt, steps, capabilityGaps, null);
    }
    public record StepTrace(
            String id,
            String label,
            ConsultStepAvailability availability
    ) {
    }
}
