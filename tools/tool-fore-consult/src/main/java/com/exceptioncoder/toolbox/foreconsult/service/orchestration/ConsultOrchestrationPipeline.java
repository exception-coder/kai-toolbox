package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

/** Executes all registered consultation steps in deterministic order. */
@Service
public class ConsultOrchestrationPipeline {

    public static final String VERSION = "consult-orchestration-v1";
    private final List<ConsultOrchestrationStep> steps;

    public ConsultOrchestrationPipeline(List<ConsultOrchestrationStep> steps) {
        this.steps = steps.stream()
                .sorted(Comparator.comparingInt(ConsultOrchestrationStep::order)
                        .thenComparing(ConsultOrchestrationStep::id))
                .toList();
    }

    public ConsultOrchestrationResult orchestrate(ConsultOrchestrationRequest request) {
        ConsultOrchestrationContext context = new ConsultOrchestrationContext(request);
        steps.forEach(step -> step.apply(context));
        List<ConsultOrchestrationResult.StepTrace> trace = steps.stream()
                .map(step -> new ConsultOrchestrationResult.StepTrace(
                        step.id(), step.label(), step.availability()))
                .toList();
        List<String> gaps = steps.stream()
                .flatMap(step -> step.capabilityGaps().stream())
                .distinct()
                .toList();
        return new ConsultOrchestrationResult(VERSION, context.renderPrompt(VERSION), trace, gaps);
    }
}
