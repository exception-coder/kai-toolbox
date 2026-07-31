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
    private final ObjectMapper mapper;

    public ConsultDispatchService(ConsultOrchestrationPipeline pipeline,
                                  ConsultQuestionClassifier questionClassifier,
                                  ObjectMapper mapper) {
        this.pipeline = pipeline;
        this.questionClassifier = questionClassifier;
        this.mapper = mapper;
    }

    public ConsultOrchestrationResult initial(StartSessionRequest request) {
        return pipeline.orchestrate(new ConsultOrchestrationRequest(
                request.question(), request.systemName(), request.systemSourcePath(),
                request.moduleNames(), request.role(), false));
    }

    public ConsultDispatchView followUp(ConsultSession session, DispatchConsultRequest request) {
        QuestionClassificationView classification = Boolean.TRUE.equals(request.forceFollowUp())
                ? new QuestionClassificationView("FOLLOW_UP", "用户确认仍作为当前问题的追问")
                : questionClassifier.classify(
                        session.getSessionId(),
                        new ClassifyQuestionRequest(request.question(), request.firstQuestion()));
        if ("NEW_QUESTION".equals(classification.classification())) {
            return ConsultDispatchView.startNewSession(classification.reason());
        }
        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                request.question(), session.getSystemName(), session.getSystemSourcePath(),
                parseModules(session.getModuleNames()), session.getRole(), true));
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
