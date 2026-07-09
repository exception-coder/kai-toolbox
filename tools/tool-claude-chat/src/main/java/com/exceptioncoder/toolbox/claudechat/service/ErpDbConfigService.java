package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * ERP 测试库只读连接配置的持久化：存 SQLite {@code claude_chat_setting} 表（name='erp-db'，payload 为 JSON 串，
 * 含密码，仅服务端持有，前端读取时脱敏）。供「ERP 需求开发」让 agent 只读查库核对逻辑用——强烈建议配只读账号，
 * 后端另有 SELECT-only 双闸。
 *
 * <p>早期该配置存 {@code ~/.kai-toolbox/erp-db.json}；现统一落 SQLite，首次读取时若表内无记录而旧 json 仍在，
 * 自动导入并把 json 改名为 {@code .bak}（一次性平滑迁移）。</p>
 */
@Slf4j
@Service
public class ErpDbConfigService {

    private static final String SETTING_NAME = "erp-db";

    /** 完整连接配置（含密码）。type 目前支持 oracle。service=Oracle service name。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErpDbConn(String type, String host, int port, String service, String user, String password) {
        public boolean isComplete() {
            return host != null && !host.isBlank() && port > 0
                    && service != null && !service.isBlank() && user != null && !user.isBlank();
        }
    }

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public ErpDbConfigService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    private static Path legacyFile() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "erp-db.json");
    }

    /** 读取完整配置（含密码）；无返回 null。表内无记录时尝试从旧 json 一次性导入。 */
    public ErpDbConn get() {
        String payload = settings.find(SETTING_NAME);
        if (payload == null) {
            return migrateFromLegacy();
        }
        try {
            return mapper.readValue(payload, ErpDbConn.class);
        } catch (IOException e) {
            log.warn("解析 erp-db 配置失败：{}", e.getMessage());
            return null;
        }
    }

    /** 保存完整配置。密码为空时保留原密码（前端脱敏保存场景：只改地址不重填密码）。 */
    public void save(ErpDbConn incoming) {
        ErpDbConn toSave = incoming;
        if (incoming.password() == null || incoming.password().isBlank()) {
            ErpDbConn old = get();
            if (old != null && old.password() != null) {
                toSave = new ErpDbConn(incoming.type(), incoming.host(), incoming.port(),
                        incoming.service(), incoming.user(), old.password());
            }
        }
        try {
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 ERP DB 配置失败：" + e.getMessage(), e);
        }
    }

    /** 一次性迁移：旧 erp-db.json 存在则导入到 SQLite 并改名 .bak，否则返回 null。 */
    private ErpDbConn migrateFromLegacy() {
        Path f = legacyFile();
        if (!Files.isRegularFile(f)) {
            return null;
        }
        try {
            ErpDbConn conn = mapper.readValue(Files.readString(f), ErpDbConn.class);
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(conn));
            Files.move(f, f.resolveSibling("erp-db.json.bak"), StandardCopyOption.REPLACE_EXISTING);
            log.info("已把旧 erp-db.json 迁入 SQLite 并改名 erp-db.json.bak");
            return conn;
        } catch (IOException e) {
            log.warn("迁移旧 erp-db.json 失败：{}", e.getMessage());
            return null;
        }
    }
}
