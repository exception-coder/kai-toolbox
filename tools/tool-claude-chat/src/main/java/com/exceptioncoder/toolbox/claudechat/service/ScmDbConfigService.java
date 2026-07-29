package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * SCM 测试库（MySQL）只读连接配置的持久化：存 SQLite {@code claude_chat_setting} 表（name='scm-db'，
 * payload 为 JSON 串，含密码，仅服务端持有，前端读取时脱敏）。供「SCM需求开发」让 agent 只读查库核对逻辑用——
 * 强烈建议配只读账号，后端 {@link ScmDbService} 另有 SELECT-only 双闸。
 *
 * <p>持久化范式完全照 {@link SrmDbConfigService}（库类型同为 MySQL）。本模块无历史散 json，故不做 legacy 迁移。</p>
 */
@Slf4j
@Service
public class ScmDbConfigService {

    private static final String SETTING_NAME = "scm-db";

    /** 完整连接配置（含密码）。database=MySQL schema 名（如 yoooni_scm）。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ScmDbConn(String host, int port, String database, String user, String password) {
        public boolean isComplete() {
            return host != null && !host.isBlank() && port > 0
                    && database != null && !database.isBlank() && user != null && !user.isBlank();
        }
    }

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public ScmDbConfigService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    /** 读取完整配置（含密码）；无返回 null。 */
    public ScmDbConn get() {
        String payload = settings.find(SETTING_NAME);
        if (payload == null) {
            return null;
        }
        try {
            return mapper.readValue(payload, ScmDbConn.class);
        } catch (IOException e) {
            log.warn("解析 scm-db 配置失败：{}", e.getMessage());
            return null;
        }
    }

    /** 保存完整配置。密码为空时保留原密码（前端脱敏保存场景：只改地址不重填密码）。 */
    public void save(ScmDbConn incoming) {
        ScmDbConn toSave = incoming;
        if (incoming.password() == null || incoming.password().isBlank()) {
            ScmDbConn old = get();
            if (old != null && old.password() != null) {
                toSave = new ScmDbConn(incoming.host(), incoming.port(),
                        incoming.database(), incoming.user(), old.password());
            }
        }
        try {
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 SCM DB 配置失败：" + e.getMessage(), e);
        }
    }
}
