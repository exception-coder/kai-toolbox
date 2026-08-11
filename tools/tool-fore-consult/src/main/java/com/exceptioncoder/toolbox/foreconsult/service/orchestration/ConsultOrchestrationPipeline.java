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
    public static final String EVIDENCE_ADAPTIVE_VERSION = "v4";
    private final List<ConsultOrchestrationStep> steps;

    public ConsultOrchestrationPipeline(List<ConsultOrchestrationStep> steps) {
        this.steps = steps.stream()
                .sorted(Comparator.comparingInt(ConsultOrchestrationStep::order)
                        .thenComparing(ConsultOrchestrationStep::id))
                .toList();
    }

    public ConsultOrchestrationResult orchestrate(ConsultOrchestrationRequest request) {
        return orchestrate(request, EVIDENCE_ADAPTIVE_VERSION);
    }

    /** 按会话快照选择调度步骤；缺失或未知版本默认使用动态证据版。 */
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
        if (EVIDENCE_ADAPTIVE_VERSION.equalsIgnoreCase(version)) {
            return EVIDENCE_ADAPTIVE_VERSION;
        }
        if (PRODUCTION_STANDBY_VERSION.equalsIgnoreCase(version)) {
            return PRODUCTION_STANDBY_VERSION;
        }
        if (OPTIMIZED_VERSION.equalsIgnoreCase(version)) {
            return OPTIMIZED_VERSION;
        }
        if (CLASSIC_VERSION.equalsIgnoreCase(version)) {
            return CLASSIC_VERSION;
        }
        return EVIDENCE_ADAPTIVE_VERSION;
    }

    private static boolean supportsVersion(ConsultOrchestrationStep step, String version) {
        boolean optimized = step instanceof ConsultOptimizedOrchestrationStep;
        boolean productionStandby = step instanceof ConsultProductionStandbyOrchestrationStep;
        boolean evidenceAdaptive = step instanceof ConsultEvidenceAdaptiveOrchestrationStep;
        return switch (version) {
            case EVIDENCE_ADAPTIVE_VERSION -> evidenceAdaptive;
            case PRODUCTION_STANDBY_VERSION -> optimized && !evidenceAdaptive;
            case OPTIMIZED_VERSION -> optimized && !productionStandby && !evidenceAdaptive;
            default -> !optimized && !evidenceAdaptive;
        };
    }
}
