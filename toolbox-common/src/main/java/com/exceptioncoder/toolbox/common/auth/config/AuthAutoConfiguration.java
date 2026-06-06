package com.exceptioncoder.toolbox.common.auth.config;

import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import com.exceptioncoder.toolbox.common.auth.web.JwtAuthFilter;
import com.exceptioncoder.toolbox.common.auth.web.RequireAuthInterceptor;
import com.exceptioncoder.toolbox.common.auth.web.SoftGuardInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 鉴权能力库装配中心。整体挂在 {@code toolbox.auth.enabled=true} 之下：开关关闭时本类不加载，
 * 过滤器 / 拦截器 / 种子用户全部不生效。
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuthAutoConfiguration implements WebMvcConfigurer {

    private final AuthUserService userService;
    private final AuthProperties props;

    public AuthAutoConfiguration(AuthUserService userService, AuthProperties props) {
        this.userService = userService;
        this.props = props;
    }

    /**
     * 认证过滤器排在链最前，先于业务处理。只拦 protected-patterns，对其它请求透明。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(
            JwtService jwtService, TokenService tokenService,
            AuthProperties props, ObjectMapper objectMapper) {
        FilterRegistrationBean<JwtAuthFilter> reg = new FilterRegistrationBean<>(
                new JwtAuthFilter(jwtService, tokenService, props, objectMapper));
        reg.addUrlPatterns("/*");
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return reg;
    }

    @Bean
    public RequireAuthInterceptor requireAuthInterceptor() {
        return new RequireAuthInterceptor();
    }

    @Bean
    public SoftGuardInterceptor softGuardInterceptor() {
        return new SoftGuardInterceptor(props);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(requireAuthInterceptor());
        registry.addInterceptor(softGuardInterceptor());
    }

    /**
     * 应用就绪后建种子管理员（若配置且用户表为空）。放在 ready 事件而非启动期，确保 schema 已建好。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void bootstrap() {
        userService.bootstrapAdminIfEmpty();
    }
}
