package com.exceptioncoder.toolbox.common.resource;

import java.util.Locale;
import java.util.Set;

/** AI可执行资源只接受明确登记的非生产环境，未知值默认拒绝。 */
public final class ResourceEnvironmentPolicy {
    private static final Set<String> ALLOWED = Set.of("LOCAL", "DEV", "TEST", "UAT");
    private ResourceEnvironmentPolicy() { }

    public static boolean allowed(String environment) {
        return environment != null && ALLOWED.contains(environment.trim().toUpperCase(Locale.ROOT));
    }

    public static void requireAllowed(String environment) {
        if (!allowed(environment)) {
            throw new IllegalArgumentException("仅允许本地、开发或测试环境资源；生产或未知环境不可查询，请到系统资源核对配置");
        }
    }
}
