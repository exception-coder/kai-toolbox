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
        });
        ConsultEvidenceRouteResolution route = traceCoordinator.traceStep(sessionId, "consult.route", () ->
                evidenceRouteService.resolve(request.systemName(), request.moduleNames(), request.question()));
        return traceCoordinator.traceStep(sessionId, "consult.prompt.build", () -> buildInitial(request, route));
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
                                new ClassifyQuestionRequest(request.question(), request.firstQuestion(), request.engine())));
        traceCoordinator.classification(sessionId, classification.classification());
        if ("NEW_QUESTION".equals(classification.classification())) {
            return ConsultDispatchView.startNewSession(classification.reason());
        }
        String routeContext = traceCoordinator.traceStep(sessionId, "consult.route", () ->
                evidenceRouteService.promptContextFromSnapshot(
                        session.getSystemName(), session.getEvidenceRouteSnapshot()));
        ConsultOrchestrationResult result = traceCoordinator.traceStep(sessionId, "consult.prompt.build", () ->
                pipeline.orchestrate(new ConsultOrchestrationRequest(
                        request.question(), session.getSystemName(), session.getSystemSourcePath(),
                        parseModules(session.getModuleNames()), session.getRole(), true, routeContext),
                        session.getOrchestrationVersion()));
        return ConsultDispatchView.send(classification.reason(), result);
    }

    private List<String> parseModules(String json) {
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
}
