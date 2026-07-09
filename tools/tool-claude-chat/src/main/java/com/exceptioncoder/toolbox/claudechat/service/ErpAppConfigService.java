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
 * 本地 ERP 实例（验证用）连接配置的持久化：存 SQLite {@code claude_chat_setting} 表（name='erp-app'，payload 为 JSON 串，
 * 含登录密码，仅服务端持有，前端读取时脱敏）。
 *
 * <p>供「ERP 需求开发」的自闭环验证用：agent 改完代码后，经 sidecar 的 erp_app MCP 回灌，
 * 后端以此配置登录拿会话、带 cookie 实发 {@code *.action} 请求，验证改动是否符合预期。
 * <b>务必只连本地/测试实例</b>——{@code ErpAppService} 另有生产域名硬拦截。</p>
 *
 * <p>早期该配置存 {@code ~/.kai-toolbox/erp-app.json}；现统一落 SQLite，首次读取时若表内无记录而旧 json 仍在，
 * 自动导入并把 json 改名为 {@code .bak}（一次性平滑迁移）。</p>
 */
@Slf4j
@Service
public class ErpAppConfigService {

    private static final String SETTING_NAME = "erp-app";

    /**
     * 本地 ERP 实例连接配置。
     *
     * @param baseUrl   实例根地址，如 http://127.0.0.1:8080/yoooni（探测请求以此为白名单基址）
     * @param loginPath 登录接口路径（相对 baseUrl，如 /login.action）；留空=该实例无需登录
     * @param userField 登录表单用户名字段名（默认 username）
     * @param passField 登录表单密码字段名（默认 password）
     * @param username  登录用户名
     * @param password  登录密码
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErpAppConn(String baseUrl, String loginPath, String userField, String passField,
                             String username, String password) {
        public boolean isComplete() {
            return baseUrl != null && !baseUrl.isBlank();
        }

        /** 需要登录：配了 loginPath 且填了用户名。 */
        public boolean needsLogin() {
            return loginPath != null && !loginPath.isBlank()
                    && username != null && !username.isBlank();
        }

        public String effUserField() {
            return userField == null || userField.isBlank() ? "username" : userField;
        }

        public String effPassField() {
            return passField == null || passField.isBlank() ? "password" : passField;
        }
    }

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public ErpAppConfigService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    private static Path legacyFile() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "erp-app.json");
    }

    /** 读取完整配置（含密码）；无返回 null。表内无记录时尝试从旧 json 一次性导入。 */
    public ErpAppConn get() {
        String payload = settings.find(SETTING_NAME);
        if (payload == null) {
            return migrateFromLegacy();
        }
        try {
            return mapper.readValue(payload, ErpAppConn.class);
        } catch (IOException e) {
            log.warn("解析 erp-app 配置失败：{}", e.getMessage());
            return null;
        }
    }

    /** 保存完整配置。密码为空时保留原密码（前端脱敏保存场景：只改地址不重填密码）。 */
    public void save(ErpAppConn incoming) {
        ErpAppConn toSave = incoming;
        if (incoming.password() == null || incoming.password().isBlank()) {
            ErpAppConn old = get();
            if (old != null && old.password() != null) {
                toSave = new ErpAppConn(incoming.baseUrl(), incoming.loginPath(), incoming.userField(),
                        incoming.passField(), incoming.username(), old.password());
            }
        }
        try {
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 ERP 实例配置失败：" + e.getMessage(), e);
        }
    }

    /** 一次性迁移：旧 erp-app.json 存在则导入到 SQLite 并改名 .bak，否则返回 null。 */
    private ErpAppConn migrateFromLegacy() {
        Path f = legacyFile();
        if (!Files.isRegularFile(f)) {
            return null;
        }
        try {
            ErpAppConn conn = mapper.readValue(Files.readString(f), ErpAppConn.class);
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(conn));
            Files.move(f, f.resolveSibling("erp-app.json.bak"), StandardCopyOption.REPLACE_EXISTING);
            log.info("已把旧 erp-app.json 迁入 SQLite 并改名 erp-app.json.bak");
            return conn;
        } catch (IOException e) {
            log.warn("迁移旧 erp-app.json 失败：{}", e.getMessage());
            return null;
        }
    }
}
