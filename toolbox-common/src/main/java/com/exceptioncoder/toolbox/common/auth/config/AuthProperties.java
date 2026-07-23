package com.exceptioncoder.toolbox.common.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 鉴权能力库配置，前缀 {@code toolbox.auth}。enabled 缺省 false，整套能力默认不加载。
 */
@Data
@ConfigurationProperties(prefix = "toolbox.auth")
public class AuthProperties {

    /** 总开关。false 时所有 auth bean / 过滤器 / 接口都不生效。 */
    private boolean enabled = false;

    /** HS256 对称密钥，>= 32 字节。enabled 时为空或过短则启动报错。 */
    private String secret;

    /** access token 有效期。 */
    private Duration accessTtl = Duration.ofMinutes(30);

    /** refresh token 有效期。 */
    private Duration refreshTtl = Duration.ofDays(7);

    /** 需要鉴权的 Ant 风格路径，命中才校验 token。空 = 不拦截任何请求。 */
    private List<String> protectedPatterns = new ArrayList<>();

    /** 始终放行的路径（优先级高于 protectedPatterns）。 */
    private List<String> whitelist = new ArrayList<>(List.of("/api/auth/login", "/api/auth/refresh"));

    /**
     * 配置驱动的 ADMIN-only 硬鉴权路径（Ant 风格）。命中的路径未登录返回 401、非 ADMIN 返回 403
     * （由 AdminOnlyInterceptor 强制）。用于批量把整批模块设为仅管理员可访问。
     */
    private List<String> adminOnlyPatterns = new ArrayList<>();

    /** 首启动种子管理员用户名。为空则不自动建号。 */
    private String bootstrapAdminUsername;

    /** 种子管理员密码。为空时随机生成并打印到启动日志。 */
    private String bootstrapAdminPassword;
}
