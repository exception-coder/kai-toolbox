package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeSource;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPoolIntegrationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * PRD 到需求池镜像的同步用例，负责同步事务、去重和孤儿清理。
 */
@Service
public class ReqPoolPrdSyncService {

    private final ReqItemRepository itemRepository;
    private final ReqPoolIntegrationRepository integrationRepository;
    private final ReqRequirementTypeService requirementTypeService;

    public ReqPoolPrdSyncService(
            ReqItemRepository itemRepository,
            ReqPoolIntegrationRepository integrationRepository,
            ReqRequirementTypeService requirementTypeService
    ) {
        this.itemRepository = itemRepository;
        this.integrationRepository = integrationRepository;
        this.requirementTypeService = requirementTypeService;
    }

    /**
     * 同步全部可见 PRD，会在一个事务中完成孤儿清理、镜像去重和字段更新。
     *
     * @return 与既有 API 兼容的 created、updated、deleted 统计
     */
    @Transactional
    public Map<String, Object> synchronize() {
        List<Map<String, Object>> sessions = integrationRepository.findSyncablePrdSessions();
        long now = System.currentTimeMillis();
        int deleted = integrationRepository.deleteOrphanMirrors();
        integrationRepository.deleteOrphanExclusions();
        int created = 0;
        int updated = 0;

        for (Map<String, Object> session : sessions) {
            SyncResult result = synchronizeSession(session, now);
            created += result.created();
            updated += result.updated();
            deleted += result.deleted();
        }
        return Map.of("created", created, "updated", updated, "deleted", deleted);
    }

    /** 查询组合分析应使用的根需求，避免修订版和拆分子项重复计权。 */
    public List<ReqItem> rootRequirements(List<ReqItem> items) {
        Set<String> childSessionIds = integrationRepository.findChildPrdSessionIds();
        return items.stream()
                .filter(item -> item.getPrdSessionId() == null
                        || !childSessionIds.contains(item.getPrdSessionId()))
                .toList();
    }

    /** 查询当前参与组合分析的活跃根需求。 */
    public List<ReqItem> currentPortfolioItems() {
        return rootRequirements(itemRepository.findAll(null, null, null)).stream()
                .filter(item -> !"CANCELLED".equals(item.getStatus()))
                .toList();
    }

    private SyncResult synchronizeSession(Map<String, Object> source, long now) {
        String prdId = String.valueOf(source.get("id"));
        String prdStatus = String.valueOf(source.get("status"));
        String title = valueOrDefault(source.get("title"), "未命名需求");
        String description = nullableValue(source.get("raw_input"));
        String project = nullableValue(source.get("project"));
        String module = nullableValue(source.get("module"));
        String prdRequirementType = nullableValue(source.get("req_type"));
        String requirementStatus = mapStatus(prdStatus);
        List<Map<String, Object>> mirrors = integrationRepository.findMirrors(prdId);

        if (mirrors.isEmpty()) {
            insertMirror(prdId, title, description, project, module, requirementStatus, prdRequirementType, now);
            return SyncResult.oneCreated();
        }
        return updateAndDeduplicateMirrors(
                mirrors,
                title,
                description,
                project,
                module,
                requirementStatus,
                prdRequirementType,
                now
        );
    }

    private void insertMirror(
            String prdId,
            String title,
            String description,
            String project,
            String module,
            String status,
            String prdRequirementType,
            long now
    ) {
        ReqItem item = ReqItem.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .description(description)
                .project(project)
                .module(module)
                .priority("MEDIUM")
                .status(status)
                .prdSessionId(prdId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        requirementTypeService.applyPrdSessionType(item, prdRequirementType);
        itemRepository.insert(item);
    }

    private SyncResult updateAndDeduplicateMirrors(
            List<Map<String, Object>> mirrors,
            String title,
            String description,
            String project,
            String module,
            String status,
            String prdRequirementType,
            long now
    ) {
        Map<String, Object> current = mirrors.getFirst();
        int deleted = deleteDuplicateMirrors(mirrors);
        if (!mirrorChanged(current, title, description, project, module, status, prdRequirementType)) {
            return new SyncResult(0, 0, deleted);
        }
        RequirementType type = RequirementType.fromCode(prdRequirementType);
        integrationRepository.updateMirror(
                String.valueOf(current.get("id")),
                title,
                description,
                project,
                module,
                status,
                type.name(),
                type.isClassified() ? RequirementTypeSource.PRD_SESSION.name() : RequirementTypeSource.UNKNOWN.name(),
                type.isClassified() ? 1 : 0,
                now
        );
        return new SyncResult(0, 1, deleted);
    }

    private int deleteDuplicateMirrors(List<Map<String, Object>> mirrors) {
        for (int index = 1; index < mirrors.size(); index++) {
            itemRepository.delete(String.valueOf(mirrors.get(index).get("id")));
        }
        return Math.max(0, mirrors.size() - 1);
    }

    private boolean mirrorChanged(
            Map<String, Object> current,
            String title,
            String description,
            String project,
            String module,
            String status,
            String prdRequirementType
    ) {
        RequirementType type = RequirementType.fromCode(prdRequirementType);
        String typeSource = type.isClassified()
                ? RequirementTypeSource.PRD_SESSION.name()
                : RequirementTypeSource.UNKNOWN.name();
        return !Objects.equals(title, current.get("title"))
                || !Objects.equals(description, current.get("description"))
                || !Objects.equals(project, current.get("project"))
                || !Objects.equals(module, current.get("module"))
                || !Objects.equals(status, current.get("status"))
                || !Objects.equals(type.name(), current.get("req_type"))
                || !Objects.equals(typeSource, current.get("req_type_source"));
    }

    private String mapStatus(String prdStatus) {
        return switch (prdStatus) {
            case "DONE" -> "PRD_READY";
            case "CLARIFYING" -> "CLARIFYING";
            default -> "DRAFT";
        };
    }

    private String valueOrDefault(Object value, String fallback) {
        return value == null ? fallback : String.valueOf(value);
    }

    private String nullableValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /** 单个 PRD 会话同步产生的计数增量。 */
    private record SyncResult(int created, int updated, int deleted) {

        private static SyncResult oneCreated() {
            return new SyncResult(1, 0, 0);
        }
    }
}
