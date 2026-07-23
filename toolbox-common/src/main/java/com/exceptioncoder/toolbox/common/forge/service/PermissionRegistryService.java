package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.api.dto.PermissionView;
import com.exceptioncoder.toolbox.common.forge.model.Permission;
import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;
import com.exceptioncoder.toolbox.common.forge.model.PermissionStatus;
import com.exceptioncoder.toolbox.common.forge.repository.PermissionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 权限码同步：启动时收集所有 {@link PermissionContributor} 声明的权限码，幂等 upsert 进 forge_permission，
 * 并把已不再声明的存量码标记为 DEPRECATED（软失效，不清孤儿绑定）。代码声明是权威源，后台只读。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class PermissionRegistryService {

    private static final Logger log = LoggerFactory.getLogger(PermissionRegistryService.class);

    private final PermissionRepository repository;
    private final List<PermissionContributor> contributors;

    public PermissionRegistryService(PermissionRepository repository, List<PermissionContributor> contributors) {
        this.repository = repository;
        this.contributors = contributors;
    }

    /**
     * 全量同步。每个声明的 code：库中不存在则 insert，存在则 updateByCode（刷新展示属性并重置 ACTIVE）。
     * 声明集合外的存量 ACTIVE 码统一转 DEPRECATED。
     */
    @Transactional
    public void syncOnStartup() {
        long now = System.currentTimeMillis();
        List<PermissionDef> declared = contributors.stream()
                .flatMap(c -> c.permissions().stream())
                .toList();

        for (PermissionDef def : declared) {
            Permission entity = toEntity(def, now);
            if (repository.findByCode(def.code()).isPresent()) {
                repository.updateByCode(entity);
            } else {
                repository.insert(entity);
            }
        }

        List<String> aliveCodes = declared.stream().map(PermissionDef::code).toList();
        repository.markDeprecatedExcept(aliveCodes, now);
        log.info("Forge 权限码同步完成：声明 {} 个，其余存量码标记 DEPRECATED", declared.size());
    }

    /** 只读权限码全量列表，供角色权限勾选树按 module + parentCode 分组展示。 */
    public List<PermissionView> list() {
        return repository.findAll().stream().map(PermissionView::from).toList();
    }

    private Permission toEntity(PermissionDef def, long now) {
        return Permission.builder()
                .code(def.code())
                .name(def.name())
                .type(def.type())
                .module(def.module())
                .parentCode(def.parentCode())
                .sort(def.sort())
                .status(PermissionStatus.ACTIVE)
                .createdAt(now)
                .updatedAt(now)
                .build();
    }
}
