package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.service.packagecache.PackageCacheManager;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 包管理器缓存配置入口，仅负责编排；配置语义由各管理器策略独立实现。
 */
@Service
public class PackageCacheConfigService {

    private final Map<String, PackageCacheManager> managers;
    private final List<PackageCacheManager> orderedManagers;

    public PackageCacheConfigService(List<PackageCacheManager> managers) {
        this.orderedManagers = managers.stream()
                .sorted(Comparator.comparingInt(manager -> orderOf(manager.id())))
                .toList();
        Map<String, PackageCacheManager> indexed = new LinkedHashMap<>();
        orderedManagers.forEach(manager -> indexed.put(manager.id(), manager));
        this.managers = java.util.Collections.unmodifiableMap(indexed);
    }

    public List<PackageCacheManager.Status> list() {
        return orderedManagers.stream().map(PackageCacheManager::status).toList();
    }

    public PackageCacheManager.Status configure(String managerId, String targetPath) {
        return manager(managerId).configure(targetPath);
    }

    private PackageCacheManager manager(String managerId) {
        if (managerId == null || managerId.isBlank()) {
            throw new IllegalArgumentException("包管理器不能为空");
        }
        PackageCacheManager manager = managers.get(managerId.toLowerCase(Locale.ROOT));
        if (manager == null) {
            throw new IllegalArgumentException("不支持的包管理器：" + managerId);
        }
        return manager;
    }

    private static int orderOf(String managerId) {
        return switch (managerId) {
            case "npm" -> 10;
            case "pip" -> 20;
            case "maven" -> 30;
            default -> Integer.MAX_VALUE;
        };
    }
}
