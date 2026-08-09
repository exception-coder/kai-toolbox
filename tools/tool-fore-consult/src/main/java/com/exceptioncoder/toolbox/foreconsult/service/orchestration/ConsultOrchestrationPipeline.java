package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

/** Executes all registered consultation steps in deterministic order. */
@Service
public class ConsultOrchestrationPipeline {

    public static final String CLASSIC_VERSION = "v1";
    public static final String OPTIMIZED_VERSION = "v2";
    public static final String PRODUCTION_STANDBY_VERSION = "v3";
    private final List<ConsultOrchestrationStep> steps;

    public ConsultOrchestrationPipeline(List<ConsultOrchestrationStep> steps) {
        this.steps = steps.stream()
                .sorted(Comparator.comparingInt(ConsultOrchestrationStep::order)
                        .thenComparing(ConsultOrchestrationStep::id))
                .toList();
    }

    public ConsultOrchestrationResult orchestrate(ConsultOrchestrationRequest request) {
        return orchestrate(request, CLASSIC_VERSION);
    }

    /** 按会话快照选择经典或优化步骤；未知版本兼容回落到 v1。 */
    public ConsultOrchestrationResult orchestrate(ConsultOrchestrationRequest request, String requestedVersion) {
        String version = normalizeVersion(requestedVersion);
        List<ConsultOrchestrationStep> selectedSteps = steps.stream()
                .filter(step -> supportsVersion(step, version))
                .toList();
        ConsultOrchestrationContext context = new ConsultOrchestrationContext(request);
        selectedSteps.forEach(step -> step.apply(context));
        List<ConsultOrchestrationResult.StepTrace> trace = selectedSteps.stream()
                .map(step -> new ConsultOrchestrationResult.StepTrace(
                        step.id(), step.label(), step.availability()))
                .toList();
        List<String> gaps = selectedSteps.stream()
                .flatMap(step -> step.capabilityGaps().stream())
                .distinct()
                .toList();
        String pipelineVersion = "consult-orchestration-" + version;
        return new ConsultOrchestrationResult(pipelineVersion, context.renderPrompt(pipelineVersion), trace, gaps);
    }

    public static String normalizeVersion(String version) {
        if (PRODUCTION_STANDBY_VERSION.equalsIgnoreCase(version)) {
            return PRODUCTION_STANDBY_VERSION;
        }
        return OPTIMIZED_VERSION.equalsIgnoreCase(version) ? OPTIMIZED_VERSION : CLASSIC_VERSION;
    }

    private static boolean supportsVersion(ConsultOrchestrationStep step, String version) {
        boolean optimized = step instanceof ConsultOptimizedOrchestrationStep;
        boolean productionStandby = step instanceof ConsultProductionStandbyOrchestrationStep;
        return switch (version) {
            case PRODUCTION_STANDBY_VERSION -> optimized;
            case OPTIMIZED_VERSION -> optimized && !productionStandby;
            default -> !optimized;
        };
    }
}
