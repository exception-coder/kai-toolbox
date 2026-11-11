package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

/** 复用模块设置表，按 Forge 会话保存；不修改用户的 Claude Code 配置文件。 */
@Service
public class ClaudeSessionOptionsService {
    public static final String KEY_PREFIX = "claude-options:";
    private final ClaudeChatSettingRepository settings;
    private final ObjectMapper mapper;

    public ClaudeSessionOptionsService(ClaudeChatSettingRepository settings, ObjectMapper mapper) {
        this.settings = settings;
        this.mapper = mapper;
    }

    public ClaudeSessionOptions get(String sessionId) {
        ClaudeSessionOptions configured = configured(sessionId);
        return configured == null ? ClaudeSessionOptions.DEFAULT : configured;
    }

    /** 未设置时不覆盖用户原生引擎已有配置。 */
    public ClaudeSessionOptions configured(String sessionId) {
        String payload = settings.find(KEY_PREFIX + sessionId);
        if (payload == null) return null;
        try {
            return mapper.readValue(payload, ClaudeSessionOptions.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Claude 会话参数无法读取，请重新保存强度设置", error);
        }
    }

    public void save(String sessionId, ClaudeSessionOptions options) {
        try {
            settings.upsert(KEY_PREFIX + sessionId, mapper.writeValueAsString(options));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Claude 会话参数无法保存", error);
        }
    }

    public void copy(String sourceId, String targetId) {
        String payload = settings.find(KEY_PREFIX + sourceId);
        if (payload != null) settings.upsert(KEY_PREFIX + targetId, payload);
    }

    public void delete(String sessionId) {
        settings.delete(KEY_PREFIX + sessionId);
    }
}
