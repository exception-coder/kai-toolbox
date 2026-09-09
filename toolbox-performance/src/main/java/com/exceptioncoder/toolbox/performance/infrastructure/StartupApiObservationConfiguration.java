package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 被动观察成功同步 MVC 请求，只保存路由模板，排除诊断及健康检查。 */
@Configuration(proxyBeanMethods = false)
public class StartupApiObservationConfiguration implements WebMvcConfigurer {

    private final StartupTelemetry telemetry;
    private final StartupReportWriter writer;

    public StartupApiObservationConfiguration(StartupTelemetry telemetry, StartupReportWriter writer) {
        this.telemetry = telemetry;
        this.writer = writer;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                        Object handler, Exception exception) {
                observe(request, response, handler, exception);
            }
        });
    }

    void observe(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (!telemetry.recording().ready() || exception != null || !(handler instanceof HandlerMethod)
                || request.isAsyncStarted() || request.getDispatcherType() != jakarta.servlet.DispatcherType.REQUEST
                || response.getStatus() < 200 || response.getStatus() >= 300) {
            return;
        }
        Object matched = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (!(matched instanceof String route) || !route.startsWith("/api/")
                || route.startsWith("/api/performance/") || route.contains("health")
                || route.contains("ready") || route.contains("error") || route.length() > 256) {
            return;
        }
        if (telemetry.recording().complete("firstApiSuccess", request.getMethod() + " " + route)) {
            writer.write(telemetry);
        }
    }
}
