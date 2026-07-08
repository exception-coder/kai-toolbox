package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpDbQueryResult;
import com.exceptioncoder.toolbox.claudechat.service.ErpDbConfigService;
import com.exceptioncoder.toolbox.claudechat.service.ErpDbConfigService.ErpDbConn;
import com.exceptioncoder.toolbox.claudechat.service.ErpDbService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * ERP 测试库只读连接：配置读写(密码脱敏) + 连通性测试 + 只读查询。
 * {@code /query} 供 sidecar 的 erp_db MCP 回灌调用（本机、无 JWT，只读且后端 SELECT-only 把关）；
 * {@code /config} GET 永不回传密码，故公开也不泄密。
 */
@RestController
@RequestMapping("/api/claude-chat/erp-db")
public class ErpDbController {

    private final ErpDbConfigService config;
    private final ErpDbService db;

    public ErpDbController(ErpDbConfigService config, ErpDbService db) {
        this.config = config;
        this.db = db;
    }

    /** 脱敏配置视图：不含密码，只回 hasPassword 标记。 */
    public record ErpDbConfigView(String type, String host, Integer port, String service, String user,
                                  boolean configured, boolean hasPassword) {
    }

    public record ErpDbSaveRequest(String type, String host, Integer port, String service, String user, String password) {
    }

    public record ErpDbQueryRequest(String sql, List<Object> params) {
    }

    @GetMapping("/config")
    public ErpDbConfigView getConfig() {
        ErpDbConn c = config.get();
        if (c == null) {
            return new ErpDbConfigView("oracle", "", null, "", "", false, false);
        }
        return new ErpDbConfigView(
                c.type() == null || c.type().isBlank() ? "oracle" : c.type(),
                c.host(), c.port() > 0 ? c.port() : null, c.service(), c.user(),
                c.isComplete(), c.password() != null && !c.password().isBlank());
    }

    @PutMapping("/config")
    public ErpDbConfigView saveConfig(@RequestBody ErpDbSaveRequest req) {
        String type = req.type() == null || req.type().isBlank() ? "oracle" : req.type();
        int port = req.port() == null ? 0 : req.port();
        config.save(new ErpDbConn(type, req.host(), port, req.service(), req.user(), req.password()));
        return getConfig();
    }

    /** 测试连通性：返回 {ok:true} 或 {ok:false, error:"..."}。 */
    @PostMapping("/test")
    public Map<String, Object> test() {
        String err = db.test();
        return err == null ? Map.of("ok", true) : Map.of("ok", false, "error", err);
    }

    /** 只读查询（sidecar erp_db MCP 回灌）。任何失败以 result.error 返回。 */
    @PostMapping("/query")
    public ErpDbQueryResult query(@RequestBody ErpDbQueryRequest req) {
        return db.query(req.sql(), req.params());
    }
}
