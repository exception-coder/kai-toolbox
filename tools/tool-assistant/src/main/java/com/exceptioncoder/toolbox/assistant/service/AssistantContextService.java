package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import com.exceptioncoder.toolbox.assistant.repository.AssistantContextSnapshotRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** 创建和读取请求时上下文快照。 */
@Service
public class AssistantContextService {

    private static final int MAX_SNAPSHOT_JSON_LENGTH = 64_000;

    private final AssistantContextSnapshotRepository repository;
    private final SessionOwnershipPort ownership;
    private final ObjectMapper objectMapper;

    public AssistantContextService(AssistantContextSnapshotRepository repository,
                                   SessionOwnershipPort ownership,
                                   ObjectMapper objectMapper) {
        this.repository = repository;
        this.ownership = ownership;
        this.objectMapper = objectMapper;
    }

    /** 保存当前用户会话的一份不可变快照。 */
    public AssistantContextSnapshot save(String sessionId, String protocolVersion, Object snapshot) {
        requireAccess(sessionId);
        long now = System.currentTimeMillis();
        AssistantContextSnapshot result = new AssistantContextSnapshot(
                UUID.randomUUID().toString(), sessionId, currentUserId(), protocolVersion,
                writeJson(snapshot), now);
        repository.insert(result);
        return result;
    }

    /** 读取当前用户会话的最新快照。 */
    public AssistantContextSnapshot latest(String sessionId) {
        requireAccess(sessionId);
        return repository.findLatest(sessionId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "会话尚无上下文快照"));
    }

    private void requireAccess(String sessionId) {
        if (!ownership.canCurrentUserAccess(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
    }

    private long currentUserId() {
        return AuthContext.current().map(principal -> principal.userId()).orElse(0L);
    }

    private String writeJson(Object snapshot) {
        try {
            String json = objectMapper.writeValueAsString(snapshot);
            if (json.length() > MAX_SNAPSHOT_JSON_LENGTH) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "上下文快照超过 64000 字符");
            }
            return json;
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "上下文快照不是有效 JSON", exception);
        }
    }
}
