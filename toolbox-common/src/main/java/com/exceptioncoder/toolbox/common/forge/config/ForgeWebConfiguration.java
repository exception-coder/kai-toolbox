package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.forge.service.ForgeGuardService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Forge 权限体系 Web 装配：注册 ForgeGuardInterceptor，启用 ForgeProperties。
 * 整套挂在 {@code toolbox.auth.enabled=true} 之下，与 auth 能力库同生命周期。
 */
@Configuration
@EnableConfigurationProperties(ForgeProperties.class)
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeWebConfiguration implements WebMvcConfigurer {

    private final ForgeGuardService guard;

    public ForgeWebConfiguration(ForgeGuardService guard) {
        this.guard = guard;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ForgeGuardInterceptor(guard));
    }
}
