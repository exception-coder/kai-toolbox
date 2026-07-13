package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.SrmDbConfigService.SrmDbConn;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 从「系统中间件台」(tool-ops) 把某数据源「带入」SRM 只读测试库连接。
 *
 * <p>走<b>本机回环 HTTP</b>调用 tool-ops 的 {@code /api/ops/datasources/{id}/connection}（含密码），
 * 而非编译期依赖 tool-ops——保持工具间松耦合（CLAUDE.md：工具按 schema 沙箱、不互相依赖）。
 * 与 {@link ErpDbImportService} 唯一不同：ERP 测试库是 Oracle，SRM 测试库是 MySQL，故只接受
 * ORACLE→只支持带入 MYSQL 数据源。密码只在后端进程内流转，从不经浏览器；写入服务端设置表。</p>
 */
@Slf4j
@Service
public class SrmDbImportService {

    /** tool-ops 的连接视图（含密码），字段对齐其 DatasourceConnection record。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OpsConnection(String id, String systemId, String env, String type, String name,
                                String host, int port, String username, String password,
                                String dbName, String params) {
    }

    private final SrmDbConfigService config;
    private final ObjectMapper mapper;
    private final int serverPort;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public SrmDbImportService(SrmDbConfigService config, ObjectMapper mapper,
                              @Value("${server.port:8080}") int serverPort) {
        this.config = config;
        this.mapper = mapper;
        this.serverPort = serverPort;
    }

    /**
     * 按中间件台数据源 id 带入。仅支持 MYSQL（SRM 测试库为 MySQL）。
     * 密码沿用中间件台里存的值；建议台账里就用只读账号。
     *
     * @return null=成功，否则错误信息
     */
    public String importFromOps(String opsDatasourceId) {
        OpsConnection c;
        try {
            URI uri = URI.create("http://127.0.0.1:" + serverPort + "/api/ops/datasources/" + opsDatasourceId + "/connection");
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) {
                return "中间件台未找到该数据源（HTTP " + resp.statusCode() + "）";
            }
            c = mapper.readValue(resp.body(), OpsConnection.class);
        } catch (Exception e) {
            return "读取中间件台数据源失败：" + e.getMessage();
        }
        if (c == null || c.type() == null) {
            return "中间件台返回为空";
        }
        if (!"MYSQL".equalsIgnoreCase(c.type())) {
            return "只支持带入 MYSQL 数据源（SRM 测试库为 MySQL），该数据源类型为 " + c.type();
        }
        // MySQL 的 dbName 即 schema 名；密码沿用台账中的值（留空则由 SrmDbConfigService 保留原密码）
        config.save(new SrmDbConn(c.host(), c.port(), c.dbName(), c.username(), c.password()));
        return null;
    }
}
