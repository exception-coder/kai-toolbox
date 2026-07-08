package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * ERP 测试库只读连接配置的持久化：存 {@code ~/.kai-toolbox/erp-db.json}（含密码，仅服务端持有，前端读取时脱敏）。
 * 供「ERP 需求开发」让 agent 只读查库核对逻辑用——强烈建议配只读账号，后端另有 SELECT-only 双闸。
 */
@Slf4j
@Service
public class ErpDbConfigService {

    /** 完整连接配置（含密码）。type 目前支持 oracle。service=Oracle service name。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErpDbConn(String type, String host, int port, String service, String user, String password) {
        public boolean isComplete() {
            return host != null && !host.isBlank() && port > 0
                    && service != null && !service.isBlank() && user != null && !user.isBlank();
        }
    }

    private final ObjectMapper mapper;

    public ErpDbConfigService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    private static Path file() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "erp-db.json");
    }

    /** 读取完整配置（含密码）；无/损坏返回 null。 */
    public ErpDbConn get() {
        Path f = file();
        if (!Files.isRegularFile(f)) {
            return null;
        }
        try {
            return mapper.readValue(Files.readString(f), ErpDbConn.class);
        } catch (IOException e) {
            log.warn("读取 erp-db.json 失败：{}", e.getMessage());
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
            Path f = file();
            Files.createDirectories(f.getParent());
            Files.writeString(f, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 ERP DB 配置失败：" + e.getMessage(), e);
        }
    }
}
