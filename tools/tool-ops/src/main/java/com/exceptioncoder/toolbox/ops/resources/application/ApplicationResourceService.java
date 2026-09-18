package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import com.exceptioncoder.toolbox.ops.resources.infrastructure.JdbcApplicationResourceRepository;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@Service
public class ApplicationResourceService {
    private final JdbcApplicationResourceRepository repository;

    public ApplicationResourceService(JdbcApplicationResourceRepository repository) { this.repository = repository; }

    public List<ApplicationResource> list() { return repository.findAll(); }

    public ApplicationResource required(String id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("应用资源不存在"));
    }

    public ApplicationResource create(Command command) {
        long now = System.currentTimeMillis();
        ApplicationResource value = build(UUID.randomUUID().toString(), command, null, now, now);
        repository.insert(value);
        return value;
    }

    public ApplicationResource update(String id, Command command) {
        ApplicationResource old = required(id);
        ApplicationResource value = build(id, command, old, old.createdAt(), System.currentTimeMillis());
        repository.update(value);
        return value;
    }

    public void delete(String id) { required(id); repository.delete(id); }

    private static ApplicationResource build(String id, Command command, ApplicationResource old,
                                             long createdAt, long updatedAt) {
        if (command == null || blank(command.name()) || blank(command.environment()) || blank(command.baseUrl())) {
            throw new IllegalArgumentException("名称、环境和实例地址不能为空");
        }
        URI uri;
        try { uri = URI.create(command.baseUrl().trim()); }
        catch (IllegalArgumentException exception) { throw new IllegalArgumentException("实例地址格式不正确"); }
        if (uri.getHost() == null || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))) {
            throw new IllegalArgumentException("实例地址必须是有效的 HTTP(S) URL");
        }
        ApplicationResource.AuthType authType;
        try { authType = ApplicationResource.AuthType.valueOf(command.authType().trim().toUpperCase()); }
        catch (Exception exception) { throw new IllegalArgumentException("不支持的认证方式"); }
        String password = blank(command.password()) && old != null ? old.password() : trim(command.password());
        return new ApplicationResource(id, command.name().trim(), command.environment().trim().toUpperCase(),
                command.baseUrl().trim().replaceAll("/+$", ""), authType, trim(command.loginPath()),
                trim(command.username()), password, defaulted(command.usernameField(), "username"),
                defaulted(command.passwordField(), "password"), defaulted(command.tokenJsonPath(), "data.accessToken"),
                trim(command.tenantHeader()), trim(command.tenantValue()), createdAt, updatedAt);
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String trim(String value) { return blank(value) ? null : value.trim(); }
    private static String defaulted(String value, String fallback) { return blank(value) ? fallback : value.trim(); }

    public record Command(String name, String environment, String baseUrl, String authType, String loginPath,
                          String username, String password, String usernameField, String passwordField,
                          String tokenJsonPath, String tenantHeader, String tenantValue) { }
}
