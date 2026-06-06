package com.exceptioncoder.toolbox.common.dynamicconfig.registry;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 可刷新配置块注册表：启动后扫描所有带 {@link Refreshable} 的 bean，按其 {@code @ConfigurationProperties}
 * prefix 建立索引，供配置中心查询/校验。
 */
@Component
public class RefreshableConfigRegistry {

    /**
     * @param prefix    配置块 prefix（= blockId）
     * @param name      展示名
     * @param beanType  目标 properties 类型，用于值绑定校验
     */
    public record BlockMeta(String prefix, String name, Class<?> beanType) {
    }

    private final Map<String, BlockMeta> blocks = new LinkedHashMap<>();

    public RefreshableConfigRegistry(ApplicationContext context) {
        for (Object bean : context.getBeansWithAnnotation(Refreshable.class).values()) {
            Class<?> type = AopUtils.getTargetClass(bean);
            Refreshable refreshable = AnnotationUtils.findAnnotation(type, Refreshable.class);
            ConfigurationProperties cp = AnnotationUtils.findAnnotation(type, ConfigurationProperties.class);
            if (refreshable == null || cp == null) {
                continue;
            }
            String prefix = cp.prefix().isEmpty() ? cp.value() : cp.prefix();
            if (prefix.isEmpty()) {
                continue;
            }
            blocks.put(prefix, new BlockMeta(prefix, refreshable.name(), type));
        }
    }

    public List<BlockMeta> blocks() {
        return List.copyOf(blocks.values());
    }

    public Optional<BlockMeta> find(String prefix) {
        return Optional.ofNullable(blocks.get(prefix));
    }
}
