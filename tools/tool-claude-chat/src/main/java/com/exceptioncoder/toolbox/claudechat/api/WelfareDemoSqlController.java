package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.WelfareDemoSqlService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 福利签收演示的受限 SQL 执行入口。仅供 sidecar 的 welfare_db MCP 工具（本机 127.0.0.1）回灌调用，
 * 在本会话的一次性 demo 库执行（库由 sessionId 绑定，外部无法指定路径）。
 * 不加鉴权：protected-patterns 为空 + 无 @SoftGuard，本机内网可达即可；表白名单在 service 层把关。
 */
@RestController
@RequestMapping("/api/claude-chat/demo")
public class WelfareDemoSqlController {

    private final WelfareDemoSqlService sqlService;

    public WelfareDemoSqlController(WelfareDemoSqlService sqlService) {
        this.sqlService = sqlService;
    }

    public record SqlRequest(String sessionId, String sql, List<Object> params) {
    }

    @PostMapping("/sql")
    public Map<String, Object> exec(@RequestBody SqlRequest req) {
        return sqlService.exec(req.sessionId(), req.sql(), req.params());
    }

    /** 演示页拉取本会话 demo 库的福利签收配置（agent 改完即时反映）。免登录可读。 */
    @GetMapping("/welfare-config/{sessionId}")
    public Map<String, Object> welfareConfig(@PathVariable String sessionId) {
        return sqlService.readWelfareConfig(sessionId);
    }
}
