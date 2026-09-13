package com.exceptioncoder.toolbox.claudechat.resources;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.ResourceDescriptor;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

/** 复用已有应用连接配置和登录执行器，不向目录返回凭据。 */
final class ApplicationResourceProvider implements ResourceProvider {
    private final String id;
    private final Supplier<Connection> connection;
    private final Supplier<String> test;
    private final Function<ResourceCall, Object> call;

    ApplicationResourceProvider(String id, Supplier<Connection> connection, Supplier<String> test,
                                Function<ResourceCall, Object> call) {
        this.id = id;
        this.connection = connection;
        this.test = test;
        this.call = call;
    }

    @Override public String id() { return id; }

    @Override public List<ResourceDescriptor> resources() {
        Connection config = connection.get();
        return List.of(new ResourceDescriptor("default", id + " 测试应用账号", "APPLICATION", "TEST",
                config == null ? "" : safeEndpoint(config.url()), config == null ? "" : config.username(),
                config != null && config.hasPassword(),
                config != null && config.configured() ? List.of("TEST", "CALL") : List.of(),
                "/tools/reqpool/resources?view=accounts"));
    }

    @Override public Object execute(String resourceId, ResourceCall request) {
        if (!"default".equals(resourceId)) throw new IllegalArgumentException("应用账号不存在");
        return switch (request.operation()) {
            case "TEST" -> {
                String error = test.get();
                yield error == null ? Map.of("ok", true) : Map.of("ok", false, "error", error);
            }
            case "CALL" -> call.apply(request);
            default -> throw new IllegalArgumentException("应用不支持该操作");
        };
    }

    static String safeEndpoint(String value) {
        if (value == null || value.isBlank()) return "";
        try {
            URI uri = URI.create(value);
            return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), uri.getPath(), null, null).toString();
        } catch (Exception exception) {
            return "地址格式无效，请检查配置";
        }
    }

    record Connection(String url, String username, boolean hasPassword, boolean configured) { }
}
