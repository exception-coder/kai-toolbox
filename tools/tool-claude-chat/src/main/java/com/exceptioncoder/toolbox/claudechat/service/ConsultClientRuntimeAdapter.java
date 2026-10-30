package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientRuntime;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/** Creates metadata only; existing attach/send controls Sidecar startup and account resolution. */
@Component
public class ConsultClientRuntimeAdapter implements ConsultClientRuntime {

    private final ClaudeChatSessionRepository repository;
    private final ClaudeChatSessionAccessPolicy access;
    private final ObjectMapper mapper;

    public ConsultClientRuntimeAdapter(
        ClaudeChatSessionRepository repository,
        ClaudeChatSessionAccessPolicy access,
        ObjectMapper mapper
    ) {
        this.repository = repository;
        this.access = access;
        this.mapper = mapper;
    }

    @Override
    public void create(Definition d) {
        access.requireProjectAllowed(d.cwd());
        try {
            repository.insert(
                ClaudeChatSession.builder()
                    .id(d.id())
                    .userId(d.owner())
                    .cwd(d.cwd())
                    .title(d.title())
                    .engine("codex")
                    .selectedModel(d.model())
                    .codexHome(d.codexHome())
                    .permissionMode("plan")
                    .executionPolicy(SessionExecutionPolicy.CONSULT_READONLY)
                    .consultEvidenceSystems(
                        mapper.writeValueAsString(d.systems())
                    )
                    .groupName(SessionExecutionPolicy.CONSULT_GROUP_NAME)
                    .status(SessionStatus.IDLE)
                    .startedAt(System.currentTimeMillis())
                    .lastSeenAt(System.currentTimeMillis())
                    .build()
            );
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException(error);
        }
    }
}
