package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * SRM 本地实例（yudao 网关，验证用）连接配置的持久化：存 SQLite {@code claude_chat_setting} 表（name='srm-app'，
 * payload 为 JSON 串，含登录密码，仅服务端持有，前端读取时脱敏）。
 *
 * <p>供「SRM需求开发」的自闭环验证用：agent 改完代码后，经 sidecar 的 srm_app MCP 回灌，
 * 后端以此配置走 OAuth2 密码登录拿 accessToken、带 {@code Authorization: Bearer} + {@code tenant-id} 头
 * 实发 REST 接口，验证改动是否符合预期。<b>务必只连本地/测试实例</b>——{@link SrmAppService} 另有生产域名硬拦截。</p>
 *
 * <p>与 ERP 的 {@code *.action} 表单登录不同：SRM 是芋道 Spring Cloud，登录返回 JSON，token 在 body 里
 * （默认取 {@code data.accessToken}，可由 {@code tokenJsonPath} 覆盖），后续请求带 Bearer 头而非 cookie。</p>
 */
@Slf4j
@Service
public class SrmAppConfigService {

    private static final String SETTING_NAME = "srm-app";

    /**
     * 本地 SRM 实例连接配置。
     *
     * @param baseUrl       网关根地址，如 http://127.0.0.1:8887（探测请求以此为白名单基址）
     * @param loginPath     登录接口路径（相对 baseUrl，如 /admin-api/system/auth/login）；留空=该实例无需登录
     * @param tenantId      多租户号，非空则登录与后续请求带 {@code tenant-id} 头
     * @param tokenJsonPath 登录响应里 accessToken 的点路径（留空=data.accessToken）
     * @param username      登录用户名
     * @param password      登录密码
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SrmAppConn(String baseUrl, String loginPath, String tenantId, String tokenJsonPath,
                             String username, String password) {
        public boolean isComplete() {
            return baseUrl != null && !baseUrl.isBlank();
        }

        /** 需要登录：配了 loginPath 且填了用户名。 */
        public boolean needsLogin() {
            return loginPath != null && !loginPath.isBlank()
                    && username != null && !username.isBlank();
        }

        public String effTokenJsonPath() {
            return tokenJsonPath == null || tokenJsonPath.isBlank() ? "data.accessToken" : tokenJsonPath;
        }
    }

    private final ObjectMapper mapper;
    private final ClaudeChatSettingRepository settings;

    public SrmAppConfigService(ObjectMapper mapper, ClaudeChatSettingRepository settings) {
        this.mapper = mapper;
        this.settings = settings;
    }

    /** 读取完整配置（含密码）；无返回 null。 */
    public SrmAppConn get() {
        String payload = settings.find(SETTING_NAME);
        if (payload == null) {
            return null;
        }
        try {
            return mapper.readValue(payload, SrmAppConn.class);
        } catch (IOException e) {
            log.warn("解析 srm-app 配置失败：{}", e.getMessage());
            return null;
        }
    }

    /** 保存完整配置。密码为空时保留原密码（前端脱敏保存场景：只改地址不重填密码）。 */
    public void save(SrmAppConn incoming) {
        SrmAppConn toSave = incoming;
        if (incoming.password() == null || incoming.password().isBlank()) {
            SrmAppConn old = get();
            if (old != null && old.password() != null) {
                toSave = new SrmAppConn(incoming.baseUrl(), incoming.loginPath(), incoming.tenantId(),
                        incoming.tokenJsonPath(), incoming.username(), old.password());
            }
        }
        try {
            settings.upsert(SETTING_NAME, mapper.writeValueAsString(toSave));
        } catch (IOException e) {
            throw new IllegalStateException("保存 SRM 实例配置失败：" + e.getMessage(), e);
        }
    }
}
