package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpDbQueryResult;
import com.exceptioncoder.toolbox.claudechat.service.SrmDbConfigService;
import com.exceptioncoder.toolbox.claudechat.service.SrmDbConfigService.SrmDbConn;
import com.exceptioncoder.toolbox.claudechat.service.SrmDbService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * SRM 测试库（MySQL）只读连接：配置读写(密码脱敏) + 连通性测试 + 只读查询。
 * {@code /query} 供 sidecar 的 srm_db MCP 回灌调用（本机、无 JWT，只读且后端 SELECT-only 把关）；
 * {@code /config} GET 永不回传密码，故公开也不泄密。
 */
@RestController
@RequestMapping("/api/claude-chat/srm-db")
public class SrmDbController {

    private final SrmDbConfigService config;
    private final SrmDbService db;

    public SrmDbController(SrmDbConfigService config, SrmDbService db) {
        this.config = config;
        this.db = db;
    }

    /** 脱敏配置视图：不含密码，只回 hasPassword 标记。 */
    public record SrmDbConfigView(String host, Integer port, String database, String user,
                                  boolean configured, boolean hasPassword) {
    }

    public record SrmDbSaveRequest(String host, Integer port, String database, String user, String password) {
    }

    public record SrmDbQueryRequest(String sql, List<Object> params) {
    }

    @GetMapping("/config")
    public SrmDbConfigView getConfig() {
        SrmDbConn c = config.get();
        if (c == null) {
            return new SrmDbConfigView("", null, "", "", false, false);
        }
        return new SrmDbConfigView(
                c.host(), c.port() > 0 ? c.port() : null, c.database(), c.user(),
                c.isComplete(), c.password() != null && !c.password().isBlank());
    }

    @PutMapping("/config")
    public SrmDbConfigView saveConfig(@RequestBody SrmDbSaveRequest req) {
        int port = req.port() == null ? 0 : req.port();
        config.save(new SrmDbConn(req.host(), port, req.database(), req.user(), req.password()));
        return getConfig();
    }

    /** 测试连通性：返回 {ok:true} 或 {ok:false, error:"..."}。 */
    @PostMapping("/test")
    public Map<String, Object> test() {
        String err = db.test();
        return err == null ? Map.of("ok", true) : Map.of("ok", false, "error", err);
    }

    /** 只读查询（sidecar srm_db MCP 回灌）。任何失败以 result.error 返回。 */
    @PostMapping("/query")
    public ErpDbQueryResult query(@RequestBody SrmDbQueryRequest req) {
        return db.query(req.sql(), req.params());
    }
}
