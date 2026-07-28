package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 开发工作台偏好持久化。复用 claude_chat_setting，避免为同类模块级 JSON 配置重复建表。
 */
@Service
public class DevPreferenceService {

    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final String KEY_PREFIX = "dev-workbench:";

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public DevPreferenceService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    public Optional<JsonNode> get(String workbenchId) {
        String payload = settings.find(settingName(workbenchId));
        if (payload == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(mapper.readTree(payload));
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "开发工作台偏好数据损坏", e);
        }
    }

    public JsonNode save(String workbenchId, JsonNode preference) {
        if (preference == null || !preference.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "开发工作台偏好必须是 JSON 对象");
        }
        try {
            settings.upsert(settingName(workbenchId), mapper.writeValueAsString(preference));
            return preference;
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "开发工作台偏好无法序列化", e);
        }
    }

    private static String settingName(String workbenchId) {
        if (workbenchId == null || !SAFE_ID.matcher(workbenchId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "开发工作台 ID 不合法");
        }
        return KEY_PREFIX + workbenchId;
    }
}
