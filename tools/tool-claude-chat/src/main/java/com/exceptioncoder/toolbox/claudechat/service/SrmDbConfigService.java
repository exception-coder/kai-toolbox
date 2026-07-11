package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * SRM 测试库（MySQL）只读连接配置的持久化：存 SQLite {@code claude_chat_setting} 表（name='srm-db'，
 * payload 为 JSON 串，含密码，仅服务端持有，前端读取时脱敏）。供「SRM需求开发」让 agent 只读查库核对逻辑用——
 * 强烈建议配只读账号，后端 {@link SrmDbService} 另有 SELECT-only 双闸。
 *
 * <p>与 ERP 的区别只在库类型（MySQL vs Oracle），持久化范式完全照 {@link ErpDbConfigService}。
 * 本模块无历史散 json，故不做 legacy 迁移。</p>
 */
@Slf4j
@Service
public class SrmDbConfigService {

    private static final String SETTING_NAME = "srm-db";

    /** 完整连接配置（含密码）。database=MySQL schema 名。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SrmDbConn(String host, int port, String database, String user, String password) {
        public boolean isComplete() {
            return host != null && !host.isBlank() && port > 0
                    && database != null && !database.isBlank() && user != null && !user.isBlank();
        }
    }

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public SrmDbConfigService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    /** 读取完整配置（含密码）；无返回 null。 */
    public SrmDbConn get() {
        String payload = settings.find(SETTING_NAME);
        if (payload == null) {
            return null;
        }
        try {
            return mapper.readValue(payload, SrmDbConn.class);
        } catch (IOException e) {
            log.warn("解析 srm-db 配置失败：{}", e.getMessage());
            return null;
        }
    }

    /** 保存完整配置。密码为空时保留原密码（前端脱敏保存场景：只改地址不重填密码）。 */
    public void save(SrmDbConn incoming) {
        SrmDbConn toSave = incoming;
        if (incoming.password() == null || incoming.password().isBlank()) {
            SrmDbConn old = get();
            if (old != null && old.password() != null) {
                toSave = new SrmDbConn(incoming.host(), incoming.port(),
                        incoming.database(), incoming.user(), old.password());
            }
        }
        try {
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 SRM DB 配置失败：" + e.getMessage(), e);
        }
    }
}
