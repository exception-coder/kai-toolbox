package com.exceptioncoder.toolbox.common.dynamicconfig.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 启动早期向 Environment 最前插入一个可变的覆盖层 PropertySource（优先级最高）。
 *
 * <p>此时 SQLite 数据源尚未就绪，故只占位空 map；真正的持久覆盖在
 * {@code DynamicConfigService} 于 ApplicationReady 后装载进这个 map 并发一次 EnvironmentChangeEvent。
 * 注册于 {@code META-INF/spring.factories}。</p>
 */
public class DynamicConfigEnvironmentPostProcessor implements EnvironmentPostProcessor {

    /** 覆盖层 PropertySource 名称，DynamicConfigService 据此取回同一个可变 map。 */
    public static final String SOURCE_NAME = "toolboxDynamicOverrides";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        MutablePropertySources sources = environment.getPropertySources();
        if (sources.contains(SOURCE_NAME)) {
            return;
        }
        Map<String, Object> overrides = new ConcurrentHashMap<>();
        sources.addFirst(new MapPropertySource(SOURCE_NAME, overrides));
    }
}
