package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.spi.ConsultationRuntimePolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/** Resolves consultation identity and immutable business scope, including background queue execution. */
@Component
public class ConsultRuntimePolicyProvider implements ConsultationRuntimePolicy {
    private final ConsultSessionRepository sessions;
    private final ConsultTurnRepository turns;
    private final BusinessConsultModelPolicyService policy;
    private final ObjectMapper mapper;

    public ConsultRuntimePolicyProvider(ConsultSessionRepository sessions, ConsultTurnRepository turns,
                                        BusinessConsultModelPolicyService policy, ObjectMapper mapper) {
        this.sessions = sessions;
        this.turns = turns;
        this.policy = policy;
        this.mapper = mapper;
    }

    @Override
    public Optional<String> savedHistory(String runtimeSessionId, Long ownerId) {
        return sessions.findByDevSessionId(runtimeSessionId).map(session -> {
            if (ownerId == null || !String.valueOf(ownerId).equals(session.getUserId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "咨询与底层会话的归属不一致");
            }
            try { return mapper.writeValueAsString(turns.findBySession(session.getSessionId())); }
            catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException("读取咨询历史失败", error); }
        });
    }

    @Override
    public Optional<Selection> resolve(String runtimeSessionId, Long ownerId) {
        return sessions.findByDevSessionId(runtimeSessionId).map(session -> {
            if (ownerId == null || !String.valueOf(ownerId).equals(session.getUserId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "咨询与底层会话的归属不一致，不能接续");
            }
            if (!"PENDING".equals(session.getArchiveStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "该咨询已归档，只能阅读或延续为新咨询");
            }
            var selected = policy.get();
            if (selected.codexHome() == null || selected.model() == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "业务咨询默认账号或模型尚未配置，请联系管理员");
            }
            try {
                String model = session.getModel() == null || session.getModel().isBlank() ? selected.model() : session.getModel();
                return new Selection(session.getSessionId(), selected.codexHome(), model, selected.version(),
                        mapper.writeValueAsString(java.util.Map.of("title", session.getQuestionTitle() == null ? "" : session.getQuestionTitle(),
                                "system", session.getSystemName() == null ? "" : session.getSystemName(), "modules", session.getModuleNames() == null ? "[]" : session.getModuleNames(),
                                "scope", session.getEvidenceRouteSnapshot() == null ? "" : session.getEvidenceRouteSnapshot())));
            } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                throw new IllegalStateException("无法读取已保存的咨询上下文，原咨询已保留", error);
            }
        });
    }
}
