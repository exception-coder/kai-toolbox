package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ClassifyQuestionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultDispatchView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.DispatchConsultRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.QuestionClassificationView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationPipeline;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationRequest;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/** Entry point shared by initial questions and follow-ups. */
@Service
public class ConsultDispatchService {

    private static final Logger log = LoggerFactory.getLogger(ConsultDispatchService.class);
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private final ConsultOrchestrationPipeline pipeline;
    private final ConsultQuestionClassifier questionClassifier;
    private final ConsultEvidenceRouteService evidenceRouteService;
    private final ConsultTurnTraceCoordinator traceCoordinator;
    private final ObjectMapper mapper;

    public ConsultDispatchService(ConsultOrchestrationPipeline pipeline,
                                  ConsultQuestionClassifier questionClassifier,
                                  ConsultEvidenceRouteService evidenceRouteService,
                                  ConsultTurnTraceCoordinator traceCoordinator,
                                  ObjectMapper mapper) {
        this.pipeline = pipeline;
        this.questionClassifier = questionClassifier;
        this.evidenceRouteService = evidenceRouteService;
        this.traceCoordinator = traceCoordinator;
        this.mapper = mapper;
    }

    public ConsultInitialDispatch initial(StartSessionRequest request) {
        return buildInitial(request, evidenceRouteService.resolve(
                request.systemName(), request.moduleNames(), request.question()));
    }

    public ConsultInitialDispatch initial(String sessionId, StartSessionRequest request) {
        traceCoordinator.traceStep(sessionId, "consult.classify", () -> {
            traceCoordinator.classification(sessionId, "INITIAL");
            return null;
        }, ignored -> classificationAttributes("INITIAL"));
        ConsultEvidenceRouteResolution route = traceCoordinator.traceStep(sessionId, "consult.route", () ->
                evidenceRouteService.resolve(request.systemName(), request.moduleNames(), request.question()),
                ConsultDispatchService::routeAttributes);
        return traceCoordinator.traceStep(sessionId, "consult.prompt.build", () -> buildInitial(request, route),
                result -> orchestrationAttributes(result.orchestration()));
    }

    private ConsultInitialDispatch buildInitial(StartSessionRequest request, ConsultEvidenceRouteResolution route) {
        ConsultOrchestrationResult orchestration = pipeline.orchestrate(new ConsultOrchestrationRequest(
                request.question(), request.systemName(), request.systemSourcePath(), request.moduleNames(),
                request.role(), false, route.promptContext()), request.orchestrationVersion());
        return new ConsultInitialDispatch(orchestration, route);
    }

    public ConsultDispatchView followUp(ConsultSession session, DispatchConsultRequest request) {
        String sessionId = session.getSessionId();
        QuestionClassificationView classification = traceCoordinator.traceStep(sessionId, "consult.classify", () ->
                Boolean.TRUE.equals(request.forceFollowUp())
                        ? new QuestionClassificationView("FOLLOW_UP", "用户确认仍作为当前问题的追问")
                        : questionClassifier.classify(
                                sessionId,
                                new ClassifyQuestionRequest(request.question(), request.firstQuestion(), request.engine())),
                result -> classificationAttributes(result.classification()));
        traceCoordinator.classification(sessionId, classification.classification());
        if ("NEW_QUESTION".equals(classification.classification())) {
            return ConsultDispatchView.startNewSession(classification.reason());
        }
        String routeContext = traceCoordinator.traceStep(sessionId, "consult.route", () ->
                evidenceRouteService.promptContextFromSnapshot(
                        session.getSystemName(), session.getEvidenceRouteSnapshot()),
                ignored -> routeAttributes(parseStringList(session.getEvidenceSystems()), null));
        ConsultOrchestrationResult result = traceCoordinator.traceStep(sessionId, "consult.prompt.build", () ->
                pipeline.orchestrate(new ConsultOrchestrationRequest(
                        request.question(), session.getSystemName(), session.getSystemSourcePath(),
                        parseStringList(session.getModuleNames()), session.getRole(), true, routeContext),
                        session.getOrchestrationVersion()), ConsultDispatchService::orchestrationAttributes);
        return ConsultDispatchView.send(classification.reason(), result);
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<String> result = mapper.readValue(json, STRING_LIST);
            return result == null ? List.of() : result;
        } catch (Exception error) {
            log.warn("[fore-consult] 无法解析调度模块快照: {}", error.getMessage());
            return List.of();
        }
    }

    private static Map<String, ?> classificationAttributes(String classification) {
        String summary = switch (classification) {
            case "INITIAL" -> "首轮问题";
            case "FOLLOW_UP" -> "继续当前咨询";
            case "NEW_QUESTION" -> "建议新建咨询";
            default -> "分类待确认";
        };
        return Map.of(
                "consult.question.type", classification,
                "consult.classification.summary", summary);
    }

    private static Map<String, ?> routeAttributes(ConsultEvidenceRouteResolution route) {
        return routeAttributes(route.evidenceSystems(), route.matchedRoutes() == null ? null : route.matchedRoutes().size());
    }

    private static Map<String, ?> routeAttributes(List<String> evidenceSystems, Integer matchCount) {
        List<String> systems = evidenceSystems == null ? List.of() : evidenceSystems.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .sorted()
                .toList();
        Map<String, Object> attributes = new LinkedHashMap<>();
        String systemNames = systems.isEmpty() ? "未授权跨系统证据" : String.join(",", systems);
        attributes.put("consult.evidence.systems", systemNames);
        if (matchCount != null) {
            attributes.put("consult.route.match_count", matchCount);
        }
        attributes.put("consult.route.summary", matchCount == null
                ? "会话证据系统：" + systemNames
                : "证据系统：" + systemNames + "；命中路线：" + matchCount);
        return attributes;
    }

    private static Map<String, ?> orchestrationAttributes(ConsultOrchestrationResult result) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("consult.prompt.template.version", result.pipelineVersion());
        attributes.put("consult.orchestration.step_count", result.steps().size());
        attributes.put("consult.knowledge_gap.count", result.capabilityGaps().size());
        attributes.put("consult.orchestration.steps", result.steps().stream()
                .map(step -> step.id() + "=" + step.availability())
                .collect(Collectors.joining(",")));
        attributes.put("consult.orchestration.summary", "编排版本：" + result.pipelineVersion()
                + "；步骤：" + result.steps().size() + "；能力缺口：" + result.capabilityGaps().size());
        return attributes;
    }
}
