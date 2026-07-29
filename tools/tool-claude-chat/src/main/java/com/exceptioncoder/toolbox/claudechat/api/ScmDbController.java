package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpDbQueryResult;
import com.exceptioncoder.toolbox.claudechat.service.ScmDbConfigService;
import com.exceptioncoder.toolbox.claudechat.service.ScmDbConfigService.ScmDbConn;
import com.exceptioncoder.toolbox.claudechat.service.ScmDbService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * SCM 测试库（MySQL）只读连接：配置读写(密码脱敏) + 连通性测试 + 只读查询。
 * {@code /query} 供 sidecar 的 scm_db MCP 回灌调用（本机、无 JWT，只读且后端 SELECT-only 把关）；
 * {@code /config} GET 永不回传密码，故公开也不泄密。
 *
 * <p>无 from-ops 导入子功能（与 erp-db/srm-db 不同）：tool-ops 暂未确认已登记 SCM 数据源，故此处只支持手填。</p>
 */
@RestController
@RequestMapping("/api/claude-chat/scm-db")
public class ScmDbController {

    private final ScmDbConfigService config;
    private final ScmDbService db;

    public ScmDbController(ScmDbConfigService config, ScmDbService db) {
        this.config = config;
        this.db = db;
    }

    /**
     * 配置视图：<b>含密码明文</b>。本工具箱为本地单用户、无鉴权模型，本地进程本就能直读 SQLite，
     * 故此处回传凭据不额外扩大攻击面；回显密码是为了让用户能直接核对/纠正配置。
     */
    public record ScmDbConfigView(String host, Integer port, String database, String user,
                                  boolean configured, boolean hasPassword, String password) {
    }

    public record ScmDbSaveRequest(String host, Integer port, String database, String user, String password) {
    }

    public record ScmDbQueryRequest(String sql, List<Object> params) {
    }

    @GetMapping("/config")
    public ScmDbConfigView getConfig() {
        ScmDbConn c = config.get();
        if (c == null) {
            return new ScmDbConfigView("", null, "", "", false, false, "");
        }
        return new ScmDbConfigView(
                c.host(), c.port() > 0 ? c.port() : null, c.database(), c.user(),
                c.isComplete(), c.password() != null && !c.password().isBlank(), c.password());
    }

    @PutMapping("/config")
    public ScmDbConfigView saveConfig(@RequestBody ScmDbSaveRequest req) {
        int port = req.port() == null ? 0 : req.port();
        config.save(new ScmDbConn(req.host(), port, req.database(), req.user(), req.password()));
        return getConfig();
    }

    /** 测试连通性：返回 {ok:true} 或 {ok:false, error:"..."}。 */
    @PostMapping("/test")
    public Map<String, Object> test() {
        String err = db.test();
        return err == null ? Map.of("ok", true) : Map.of("ok", false, "error", err);
    }

    /** 只读查询（sidecar scm_db MCP 回灌）。任何失败以 result.error 返回。 */
    @PostMapping("/query")
    public ErpDbQueryResult query(@RequestBody ScmDbQueryRequest req) {
        return db.query(req.sql(), req.params());
    }
}
