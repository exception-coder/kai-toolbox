package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;

import java.util.List;

public record ConsultDispatchView(
        String action,
        String reason,
        String prompt,
        String pipelineVersion,
        List<StepView> steps,
        List<String> capabilityGaps
) {
    public static ConsultDispatchView send(String reason, ConsultOrchestrationResult result) {
        return new ConsultDispatchView(
                "SEND",
                reason,
                result.prompt(),
                result.pipelineVersion(),
                result.steps().stream()
                        .map(step -> new StepView(step.id(), step.label(), step.availability().name()))
                        .toList(),
                result.capabilityGaps());
    }

    public static ConsultDispatchView startNewSession(String reason) {
        return new ConsultDispatchView(
                "START_NEW_SESSION", reason, null, null, List.of(), List.of());
    }

    public record StepView(String id, String label, String availability) {
    }
}
