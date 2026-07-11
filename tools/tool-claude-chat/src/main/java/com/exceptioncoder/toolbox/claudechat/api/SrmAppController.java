package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpAppCallResult;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppConfigService;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppConfigService.SrmAppConn;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * SRM 本地实例（yudao 网关，验证用）：配置读写(密码脱敏) + 登录/连通性测试 + 探测请求。
 * {@code /call} 供 sidecar 的 srm_app MCP 回灌调用（本机、无 JWT，靠 host 白名单 + 拒生产域把关）；
 * {@code /config} GET 永不回传密码，故公开也不泄密。
 */
@RestController
@RequestMapping("/api/claude-chat/srm-app")
public class SrmAppController {

    private final SrmAppConfigService config;
    private final SrmAppService app;

    public SrmAppController(SrmAppConfigService config, SrmAppService app) {
        this.config = config;
        this.app = app;
    }

    /** 脱敏配置视图：不含密码，只回 hasPassword 标记。 */
    public record SrmAppConfigView(String baseUrl, String loginPath, String tenantId, String tokenJsonPath,
                                   String username, boolean configured, boolean hasPassword) {
    }

    public record SrmAppSaveRequest(String baseUrl, String loginPath, String tenantId, String tokenJsonPath,
                                    String username, String password) {
    }

    public record SrmAppCallRequest(String method, String path, Map<String, Object> params, String bodyType) {
    }

    @GetMapping("/config")
    public SrmAppConfigView getConfig() {
        SrmAppConn c = config.get();
        if (c == null) {
            return new SrmAppConfigView("", "", "", "", "", false, false);
        }
        return new SrmAppConfigView(
                c.baseUrl(), c.loginPath(), c.tenantId(), c.tokenJsonPath(), c.username(),
                c.isComplete(), c.password() != null && !c.password().isBlank());
    }

    @PutMapping("/config")
    public SrmAppConfigView saveConfig(@RequestBody SrmAppSaveRequest req) {
        config.save(new SrmAppConn(req.baseUrl(), req.loginPath(), req.tenantId(), req.tokenJsonPath(),
                req.username(), req.password()));
        return getConfig();
    }

    /** 测试连通/登录：返回 {ok:true} 或 {ok:false, error:"..."}。 */
    @PostMapping("/test")
    public Map<String, Object> test() {
        String err = app.test();
        return err == null ? Map.of("ok", true) : Map.of("ok", false, "error", err);
    }

    /** 探测请求（sidecar srm_app MCP 回灌）。任何失败以 result.error 返回。 */
    @PostMapping("/call")
    public ErpAppCallResult call(@RequestBody SrmAppCallRequest req) {
        return app.call(req.method(), req.path(), req.params(), req.bodyType());
    }
}
