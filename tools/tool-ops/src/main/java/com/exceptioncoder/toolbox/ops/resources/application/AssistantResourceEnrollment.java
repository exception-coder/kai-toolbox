package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.ops.api.dto.DatasourceRequest;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.service.OpsDatasourceService;
import com.exceptioncoder.toolbox.ops.security.OpsCredentialCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/** 管理员确认后登记到原资源中心；不向模型开放写工具。 */
@Service
public class AssistantResourceEnrollment {
    private final OpsDatasourceService datasources;
    private final DatasourceRepository datasourceRepository;
    private final ApplicationResourceService applications;
    private final JdbcTemplate jdbc;
    private final OpsCredentialCipher cipher;
    private final ObjectMapper mapper;
    private final List<com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway> hosts;

    public AssistantResourceEnrollment(OpsDatasourceService datasources, DatasourceRepository datasourceRepository,
            ApplicationResourceService applications, JdbcTemplate jdbc, OpsCredentialCipher cipher, ObjectMapper mapper,
            List<com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway> hosts) {
        this.datasources = datasources;
        this.datasourceRepository = datasourceRepository;
        this.applications = applications;
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.mapper = mapper;
        this.hosts = hosts;
    }

    /** 验证权限、目标和重复资源后一次性保存；事务失败不留下成功回执。 */
    @Transactional
    public Receipt enroll(Command command) {
        var user = AuthContext.current().filter(value -> value.hasAnyRole("ADMIN"))
                .orElseThrow(AuthException::forbidden);
        validate(command);
        String signature;
        try {
            signature = cipher.fingerprint(mapper.writeValueAsString(command));
        } catch (java.io.IOException failure) {
            throw new IllegalArgumentException("登记参数无效");
        }
        int claimed = jdbc.update("""
                INSERT OR IGNORE INTO ops_assistant_enrollment
                (user_id,request_id,signature,resource_id,kind,created_at) VALUES (?,?,?,'',?,?)
                """, user.userId(), command.requestId(), signature, command.kind(), System.currentTimeMillis());
        if (claimed == 0) {
            return jdbc.query("""
                    SELECT signature,resource_id,kind FROM ops_assistant_enrollment
                    WHERE user_id=? AND request_id=?
                    """, (row, index) -> {
                        if (!signature.equals(row.getString("signature"))) {
                            throw new IllegalArgumentException("该登记请求已使用，请核对结果或重新预览");
                        }
                        return receipt(row.getString("resource_id"), row.getString("kind"));
                    }, user.userId(), command.requestId()).getFirst();
        }
        String id = switch (command.kind()) {
            case "DATABASE" -> createDatasource(command);
            case "HOST" -> createHost(command);
            default -> createApplication(command);
        };
        jdbc.update("UPDATE ops_assistant_enrollment SET resource_id=? WHERE user_id=? AND request_id=?",
                id, user.userId(), command.requestId());
        return receipt(id, command.kind());
    }

    private String createDatasource(Command value) {
        if (jdbc.queryForObject("SELECT count(*) FROM ops_system WHERE id=?", Integer.class, value.systemId()) == 0) {
            throw new IllegalArgumentException("请选择已有系统分组");
        }
        var duplicate = datasourceRepository.findBySystem(value.systemId()).stream().filter(item ->
                item.getEnv().equals(value.environment()) && item.getType().name().equals(value.type())
                        && item.getHost().equalsIgnoreCase(value.host().strip()) && item.getPort() == value.port()
                        && java.util.Objects.equals(item.getDbName(), blank(value.database()))
                        && java.util.Objects.equals(item.getUsername(), blank(value.username()))).findFirst();
        if (duplicate.isPresent()) {
            throw new IllegalArgumentException("该连接与账号已登记，请在原资源中心编辑，记录 ID：" + duplicate.get().getId());
        }
        return datasources.create(new DatasourceRequest(value.systemId(), value.environment(), value.type(),
                value.name(), value.host(), value.port(), value.username(), value.password(), value.database(),
                null, null, 0)).getId();
    }

    private String createHost(Command value) {
        if (hosts.size() != 1) throw new IllegalArgumentException("主机登记能力未就绪，请到主机管理核对");
        if (value.systemId() == null || jdbc.queryForObject("SELECT count(*) FROM ops_system WHERE id=?", Integer.class, value.systemId()) == 0) {
            throw new IllegalArgumentException("请选择已有系统分组");
        }
        return hosts.getFirst().register(new com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway.Command(
                value.name(), value.environment(), value.systemId(), value.host(), value.port(), value.username(), value.password()));
    }

    private String createApplication(Command value) {
        String url = java.net.URI.create(value.baseUrl()).normalize().toString().replaceAll("/+$", "");
        if (applications.list().stream().anyMatch(item -> item.environment().equals(value.environment())
                && item.baseUrl().equalsIgnoreCase(url) && java.util.Objects.equals(item.username(), blank(value.username())))) {
            throw new IllegalArgumentException("该站点账号已登记，请在原应用站点中编辑");
        }
        return applications.create(new ApplicationResourceService.Command(value.name(), value.environment(), url,
                "FORM_COOKIE", value.loginPath(), value.username(), value.password(), "username", "password",
                "data.accessToken", null, null)).id();
    }

    private void validate(Command value) {
        if (value == null || value.requestId() == null || !value.requestId().matches("[A-Za-z0-9-]{16,80}")
                || !Set.of("DATABASE", "APPLICATION", "HOST").contains(value.kind() == null ? "" : value.kind())
                || !Set.of("LOCAL", "DEV", "TEST", "UAT", "PROD").contains(value.environment() == null ? "" : value.environment())
                || value.name() == null || value.name().isBlank() || value.name().length() > 100
                || value.password() != null && value.password().length() > 4096) {
            throw new IllegalArgumentException("请核对登记类型、名称、环境和请求标识");
        }
        for (String field : new String[]{value.username(), value.host(), value.database(), value.baseUrl(), value.loginPath()}) {
            if (field != null && field.length() > 250) {
                throw new IllegalArgumentException("账号、地址和路径字段最多 250 字符");
            }
        }
        if ("DATABASE".equals(value.kind()) && (value.systemId() == null || value.host() == null
                || !value.host().matches("[A-Za-z0-9.:-]{1,253}") || value.port() == null
                || value.port() < 1 || value.port() > 65535
                || !Set.of("MYSQL", "ORACLE", "REDIS", "RABBITMQ", "KAFKA").contains(value.type() == null ? "" : value.type()))) {
            throw new IllegalArgumentException("请核对系统、实例类型、主机和端口");
        }
        if ("APPLICATION".equals(value.kind())) {
            java.net.URI uri;
            try {
                uri = java.net.URI.create(value.baseUrl());
            } catch (RuntimeException failure) {
                throw new IllegalArgumentException("站点地址无效");
            }
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null
                    || !List.of("http", "https").contains(uri.getScheme())) {
                throw new IllegalArgumentException("站点须为不含凭据和查询参数的 HTTP(S) 地址");
            }
            if (value.loginPath() != null && !value.loginPath().isBlank()
                    && (!value.loginPath().startsWith("/") || value.loginPath().startsWith("//")
                    || value.loginPath().contains("?") || value.loginPath().contains("#"))) {
                throw new IllegalArgumentException("登录路径须为站内路径，不含查询参数或凭据");
            }
        }
        if ("HOST".equals(value.kind()) && (value.host() == null || !value.host().matches("[A-Za-z0-9.:-]{1,253}")
                || value.port() == null || value.port() < 1 || value.port() > 65535)) {
            throw new IllegalArgumentException("请核对主机地址和 SSH 端口");
        }
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private Receipt receipt(String id, String kind) {
        if ("HOST".equals(kind)) return new Receipt(id, "/tools/hosts");
        return new Receipt(id, "/tools/reqpool/resources?view="
                + ("DATABASE".equals(kind) ? "connections&editDatasource=" + id : "accounts"));
    }

    /** 密码仅经安全表单进入此命令；禁止输出记录默认 toString。 */
    public record Command(String requestId, String kind, String name, String environment, String systemId,
                          String type, String host, Integer port, String database, String baseUrl,
                          String loginPath, String username, String password) {
        @Override public String toString() { return "ResourceEnrollment[redacted]"; }
    }

    /** 不含凭据的登记回执。 */
    public record Receipt(String resourceId, String configurationUrl) { }
}
