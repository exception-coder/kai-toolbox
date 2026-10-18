package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.forge.service.ForgeGuardService;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginResources;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** 解析受信任预览目标，并从既有认证/资源中心取得服务端登录上下文。 */
@Component
public class PreviewTargets {
    private final Set<String> origins;
    private final List<BrowserLoginResources> resources;
    private final ObjectMapper mapper;
    private final ForgeGuardService guard;

    public PreviewTargets(@Value("${toolbox.browser-request.preview-origins:https://localhost:5173,http://localhost:5173,http://localhost:8080}") String origins,
                          List<BrowserLoginResources> resources, ObjectMapper mapper, @org.springframework.lang.Nullable ForgeGuardService guard) {
        this.origins = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isBlank())
                .map(PreviewTargets::origin).collect(Collectors.toUnmodifiableSet());
        this.resources = resources;
        this.mapper = mapper;
        this.guard = guard;
    }

    public List<BrowserLoginTarget> resources(AuthPrincipal user) {
        if (!user.hasAnyRole("ADMIN")) {
            return List.of();
        }
        return resources.stream().flatMap(provider -> provider.targets().stream()).toList();
    }

    PreviewPlan resolve(PreviewRequest request, AuthPrincipal user, String token) {
        String route = path(request.route());
        if (route.startsWith("/tools/fore-consult/preview")) {
            throw new IllegalArgumentException("不能预览预览窗口自身");
        }
        if (request.device() != null && !Set.of("phone", "desktop").contains(request.device())) {
            throw new IllegalArgumentException("设备仅支持 phone 或 desktop");
        }
        boolean phone = "phone".equals(request.device());
        String scene = request.scene() == null ? "page" : request.scene();
        if (!Set.of("page", "consult-image").contains(scene)) {
            throw new IllegalArgumentException("未知预览场景");
        }
        if (request.resourceId() != null && !request.resourceId().isBlank()) {
            if (!user.hasAnyRole("ADMIN")) {
                throw AuthException.forbidden();
            }
            List<BrowserLoginResources> matches = resources.stream().filter(provider -> provider.targets().stream()
                    .anyMatch(target -> target.id().equals(request.resourceId()))).toList();
            if (matches.size() != 1) {
                throw new IllegalArgumentException("测试应用资源不可用或身份有歧义");
            }
            BrowserLoginTarget secret = matches.get(0).require(request.resourceId());
            return new PreviewPlan(applicationOrigin(secret.baseUrl()), route, path(request.loginPage() == null ? "/" : request.loginPage()),
                    request.readySelector(), scene, phone, null, secret);
        }
        String origin = origin(request.origin());
        if (!origins.contains(origin)) {
            throw new IllegalArgumentException("Forge 预览来源未配置，请在 preview-origins 中登记精确来源");
        }
        if (token == null || token.isBlank() || user.expiresAt() <= System.currentTimeMillis() + 30000) {
            throw new IllegalArgumentException("当前登录即将过期，请重新登录后预览");
        }
        return new PreviewPlan(origin, route, null, request.readySelector(), scene, phone, storage(origin, token, user), null);
    }

    private String storage(String origin, String token, AuthPrincipal user) {
        try {
            Map<String, String> values = Map.of("toolbox.auth.token", token,
                    "toolbox.auth.expiresAt", String.valueOf(user.expiresAt()),
                    "toolbox.auth.user", mapper.writeValueAsString(Map.of("userId", user.userId(),
                            "username", user.username(), "roles", user.roles())),
                    "toolbox.auth.perms", mapper.writeValueAsString(user.permissionCodes() == null ? List.of() : user.permissionCodes()),
                    "toolbox.auth.superAdmin", String.valueOf(guard != null && guard.isSuperAdmin(user)));
            List<Map<String, String>> entries = values.entrySet().stream()
                    .map(entry -> Map.of("name", entry.getKey(), "value", entry.getValue())).toList();
            return mapper.writeValueAsString(Map.of("cookies", List.of(), "origins",
                    List.of(Map.of("origin", origin, "localStorage", entries))));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法准备当前用户的登录状态");
        }
    }

    private static String applicationOrigin(String value) {
        URI uri = URI.create(value);
        return origin(uri.getScheme() + "://" + uri.getRawAuthority());
    }

    static String origin(String value) {
        URI uri;
        try { uri = URI.create(value); } catch (RuntimeException exception) {
            throw new IllegalArgumentException("预览来源格式不正确");
        }
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getFragment() != null
                || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
            throw new IllegalArgumentException("预览来源必须是精确 HTTP(S) 来源，不能包含路径或凭据");
        }
        boolean defaultPort = uri.getPort() == -1 || ("https".equals(uri.getScheme()) && uri.getPort() == 443)
                || ("http".equals(uri.getScheme()) && uri.getPort() == 80);
        return uri.getScheme() + "://" + uri.getHost().toLowerCase() + (defaultPort ? "" : ":" + uri.getPort());
    }

    static String path(String value) {
        if (value == null || !value.startsWith("/") || value.startsWith("//") || value.contains("\\")
                || value.matches("(?i).*[?&](access_token|password|token)=.*")) {
            throw new IllegalArgumentException("预览路径必须是站内路径且不能携带凭据");
        }
        URI uri = URI.create(value);
        if (uri.isAbsolute() || uri.getRawAuthority() != null) {
            throw new IllegalArgumentException("预览路径不能指向其他站点");
        }
        return value;
    }
}
