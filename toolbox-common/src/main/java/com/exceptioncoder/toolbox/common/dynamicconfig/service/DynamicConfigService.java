package com.exceptioncoder.toolbox.common.dynamicconfig.service;

import com.exceptioncoder.toolbox.common.dynamicconfig.DynamicConfigException;
import com.exceptioncoder.toolbox.common.dynamicconfig.api.dto.ConfigBlockSummary;
import com.exceptioncoder.toolbox.common.dynamicconfig.api.dto.ConfigBlockView;
import com.exceptioncoder.toolbox.common.dynamicconfig.config.DynamicConfigEnvironmentPostProcessor;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry.BlockMeta;
import com.exceptioncoder.toolbox.common.dynamicconfig.repository.DynamicConfigOverrideRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Service;

import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 配置中心核心：装载持久覆盖、应用/重置覆盖、读有效值，并发 EnvironmentChangeEvent 触发
 * spring-cloud 的 ConfigurationPropertiesRebinder 重绑 @ConfigurationProperties bean（不重启）。
 */
@Service
public class DynamicConfigService {

    private static final Logger log = LoggerFactory.getLogger(DynamicConfigService.class);
    private static final String EMPTY_LIST_SENTINEL = "__toolbox_empty_list__";

    private final ConfigurableEnvironment environment;
    private final ApplicationEventPublisher publisher;
    private final DynamicConfigOverrideRepository repository;
    private final RefreshableConfigRegistry registry;

    public DynamicConfigService(ConfigurableEnvironment environment,
                                ApplicationEventPublisher publisher,
                                DynamicConfigOverrideRepository repository,
                                RefreshableConfigRegistry registry) {
        this.environment = environment;
        this.publisher = publisher;
        this.repository = repository;
        this.registry = registry;
    }

    /** 应用就绪后从 SQLite 装载持久覆盖并触发一次 rebind，使重启后覆盖立即生效。 */
    @EventListener(ApplicationReadyEvent.class)
    public void loadPersistedOverrides() {
        Map<String, String> persisted = repository.findAll();
        if (persisted.isEmpty()) {
            return;
        }
        persisted.forEach((key, value) -> overrideMap().put(key, toRuntimeValue(value)));
        publisher.publishEvent(new EnvironmentChangeEvent(persisted.keySet()));
        log.info("[dynamic-config] 已装载 {} 条持久配置覆盖", persisted.size());
    }

    public List<ConfigBlockSummary> listBlocks() {
        return registry.blocks().stream()
                .map(b -> new ConfigBlockSummary(b.prefix(), b.name()))
                .toList();
    }

    public ConfigBlockView view(String blockId) {
        BlockMeta meta = requireBlock(blockId);
        Map<String, Object> overrides = overrideMap();

        // 字段中文说明（@ConfigDesc）：key 与配置项 key 对齐，UI 就近展示，未标注则为空串
        Map<String, String> descByKey = new LinkedHashMap<>();
        for (Field field : meta.beanType().getDeclaredFields()) {
            com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc desc =
                    field.getAnnotation(com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc.class);
            if (desc != null) {
                descByKey.put(meta.prefix() + "." + toKebabCase(field.getName()), desc.value());
            }
        }

        List<ConfigBlockView.Entry> entries = new ArrayList<>();
        Set<String> listPrefixes = new LinkedHashSet<>();
        for (Field field : meta.beanType().getDeclaredFields()) {
            if (!isStringListField(field)) {
                continue;
            }
            String key = meta.prefix() + "." + toKebabCase(field.getName());
            List<String> values = Binder.get(environment)
                    .bind(key, Bindable.listOf(String.class))
                    .orElse(List.of());
            entries.add(new ConfigBlockView.Entry(
                    key,
                    String.join("\n", values),
                    hasOverrideForPrefix(overrides, key),
                    "list",
                    values,
                    descByKey.getOrDefault(key, "")));
            listPrefixes.add(key);
        }

        Set<String> keys = new TreeSet<>();
        for (PropertySource<?> ps : environment.getPropertySources()) {
            if (ps instanceof EnumerablePropertySource<?> eps) {
                for (String name : eps.getPropertyNames()) {
                    if (belongsTo(meta.prefix(), name)) {
                        keys.add(name);
                    }
                }
            }
        }

        keys.stream()
                .filter(key -> listPrefixes.stream().noneMatch(prefix -> key.equals(prefix) || key.startsWith(prefix + "[")))
                .map(key -> new ConfigBlockView.Entry(
                        key,
                        environment.getProperty(key),
                        overrides.containsKey(key),
                        "string",
                        List.of(),
                        descByKey.getOrDefault(key, "")))
                .forEach(entries::add);
        return new ConfigBlockView(meta.prefix(), meta.name(), entries);
    }

    public ConfigBlockView applyOverrides(String blockId, Map<String, String> overrides, List<String> replacePrefixes) {
        BlockMeta meta = requireBlock(blockId);
        List<String> prefixesToReplace = replacePrefixes == null ? List.of() : replacePrefixes;
        overrides.forEach((key, value) -> {
            if (!belongsTo(meta.prefix(), key)) {
                throw DynamicConfigException.keyNotInBlock(key, meta.prefix());
            }
        });
        prefixesToReplace.forEach(prefix -> {
            if (!belongsTo(meta.prefix(), prefix)) {
                throw DynamicConfigException.keyNotInBlock(prefix, meta.prefix());
            }
        });

        Map<String, Object> map = overrideMap();
        Map<String, Object> backup = new LinkedHashMap<>();
        Set<String> removedKeys = map.keySet().stream()
                .filter(key -> prefixesToReplace.stream().anyMatch(prefix -> belongsTo(prefix, key)))
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        removedKeys.forEach(key -> backup.put(key, map.get(key)));
        overrides.keySet().forEach(k -> backup.put(k, map.get(k)));

        removedKeys.forEach(map::remove);
        overrides.forEach((key, value) -> map.put(key, toRuntimeOverrideValue(key, value, prefixesToReplace)));
        try {
            // 用 Binder 把整块绑到目标类型，校验新值类型合法；失败回滚不污染。
            Binder.get(environment).bind(meta.prefix(), Bindable.of(meta.beanType()));
        } catch (RuntimeException e) {
            restore(map, backup);
            throw DynamicConfigException.valueInvalid("配置值无法绑定到 " + meta.prefix() + ": " + rootMessage(e));
        }

        long now = System.currentTimeMillis();
        repository.deleteByPrefixes(prefixesToReplace);
        overrides.forEach((k, v) -> repository.upsert(k, toPersistedValue(k, v, prefixesToReplace), now));
        Set<String> changedKeys = new LinkedHashSet<>(removedKeys);
        changedKeys.addAll(prefixesToReplace);
        changedKeys.addAll(overrides.keySet());
        publisher.publishEvent(new EnvironmentChangeEvent(changedKeys));
        log.info("[dynamic-config] 应用 {} 条覆盖到 {}", overrides.size(), meta.prefix());
        return view(blockId);
    }

    public ConfigBlockView reset(String blockId) {
        BlockMeta meta = requireBlock(blockId);
        Map<String, Object> map = overrideMap();
        Set<String> removed = map.keySet().stream()
                .filter(k -> belongsTo(meta.prefix(), k))
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
        removed.forEach(map::remove);
        repository.deleteByPrefix(meta.prefix());
        if (!removed.isEmpty()) {
            publisher.publishEvent(new EnvironmentChangeEvent(removed));
        }
        log.info("[dynamic-config] 重置 {}，清除 {} 条覆盖", meta.prefix(), removed.size());
        return view(blockId);
    }

    private BlockMeta requireBlock(String blockId) {
        return registry.find(blockId).orElseThrow(() -> DynamicConfigException.blockNotFound(blockId));
    }

    private boolean belongsTo(String prefix, String key) {
        return key.equals(prefix) || key.startsWith(prefix + ".") || key.startsWith(prefix + "[");
    }

    private boolean hasOverrideForPrefix(Map<String, Object> overrides, String prefix) {
        return overrides.keySet().stream().anyMatch(key -> key.equals(prefix) || key.startsWith(prefix + "["));
    }

    private Object toRuntimeValue(String value) {
        if (EMPTY_LIST_SENTINEL.equals(value)) {
            return List.of();
        }
        return value;
    }

    private Object toRuntimeOverrideValue(String key, String value, List<String> replacePrefixes) {
        if (replacePrefixes.contains(key) && value.isBlank()) {
            return List.of();
        }
        return value;
    }

    private String toPersistedValue(String key, String value, List<String> replacePrefixes) {
        if (replacePrefixes.contains(key) && value.isBlank()) {
            return EMPTY_LIST_SENTINEL;
        }
        return value;
    }

    private boolean isStringListField(Field field) {
        if (!List.class.isAssignableFrom(field.getType())) {
            return false;
        }
        Type type = field.getGenericType();
        if (!(type instanceof ParameterizedType parameterizedType)) {
            return false;
        }
        Type itemType = parameterizedType.getActualTypeArguments()[0];
        return itemType == String.class;
    }

    private String toKebabCase(String value) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isUpperCase(c)) {
                if (i > 0) {
                    sb.append('-');
                }
                sb.append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> overrideMap() {
        PropertySource<?> ps = environment.getPropertySources()
                .get(DynamicConfigEnvironmentPostProcessor.SOURCE_NAME);
        if (ps instanceof MapPropertySource mps) {
            return (Map<String, Object>) mps.getSource();
        }
        throw new IllegalStateException("动态配置覆盖 PropertySource 缺失，EnvironmentPostProcessor 未生效");
    }

    private void restore(Map<String, Object> map, Map<String, Object> backup) {
        backup.forEach((k, v) -> {
            if (v == null) {
                map.remove(k);
            } else {
                map.put(k, v);
            }
        });
    }

    private String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        return cur.getMessage();
    }
}
