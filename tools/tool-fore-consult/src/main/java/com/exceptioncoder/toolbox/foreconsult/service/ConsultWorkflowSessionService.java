package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 创建咨询与冻结流程处于同一事务，避免提示词与装配跨版本。 */
@Service
public class ConsultWorkflowSessionService {
    private final ConsultService sessions;
    private final ConsultWorkflowRepository workflows;

    public ConsultWorkflowSessionService(ConsultService sessions, ConsultWorkflowRepository workflows) {
        this.sessions = sessions;
        this.workflows = workflows;
    }

    @Transactional
    public ConsultSession start(StartSessionRequest request, ConsultInitialDispatch dispatch) {
        var result = dispatch.orchestration();
        var session = sessions.startSession(request, result.prompt(), dispatch.evidenceRoute());
        if (result.workflowSnapshot() != null) {
            workflows.freeze(session.getSessionId(), result.workflowSnapshot());
        }
        return session;
    }
}
