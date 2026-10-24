package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.Objects;

/** 用户的会话导航偏好，复用模块 KV；不修改会话活动时间或其他用户的置顶。 */
@Service
public class SessionPinService {
    private final ClaudeChatSettingRepository settings;
    private final ObjectMapper mapper;

    public SessionPinService(ClaudeChatSettingRepository settings, ObjectMapper mapper) {
        this.settings = settings;
        this.mapper = mapper;
    }

    /** 每次列表只读一次用户偏好，避免逐行查询。 */
    public Snapshot current() {
        Long userId = AuthContext.current().map(principal -> principal.userId()).orElse(null);
        String key = "session-pins:" + (userId == null ? "local" : userId);
        String payload = settings.find(key);
        try {
            var tree = payload == null ? mapper.createObjectNode() : mapper.readTree(payload);
            if (!(tree instanceof ObjectNode pins)) throw new IllegalStateException("会话置顶偏好格式损坏，请联系管理员核对");
            return new Snapshot(key, userId, pins);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("会话置顶偏好无法读取，未覆盖原记录", exception);
        }
    }

    /** 同一实例串行合并，防止同时置顶两条会话覆盖同一用户 JSON。重复置顶保留原时间。 */
    public synchronized void set(String sessionId, boolean pinned) {
        var snapshot = current();
        long previous = snapshot.pins().path(sessionId).asLong(0);
        snapshot.pins().put(sessionId, pinned ? previous > 0 ? previous : System.currentTimeMillis() : 0L);
        settings.upsert(snapshot.key(), snapshot.pins().toString());
    }

    public record Snapshot(String key, Long userId, ObjectNode pins) {
        public Pin state(ClaudeChatSession session) {
            if (pins.has(session.getId())) {
                long value = pins.path(session.getId()).asLong(0);
                return new Pin(value > 0, value > 0 ? value : null);
            }
            // 旧收藏只迁移给原会话拥有者；管理员浏览他人的会话不继承其偏好。
            return new Pin(Objects.equals(userId, session.getUserId()) && session.isFavorite(), null);
        }
    }

    public record Pin(boolean pinned, Long pinnedAt) { }
}
