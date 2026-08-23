package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 维护 PRD 后台修订树，并恢复历史原地覆盖产生的版本。 */
@Slf4j
@Service
public class PrdDocRevisionService {

    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final PrdArtifactService artifactService;
    private final ObjectMapper mapper;

    public PrdDocRevisionService(PrdSessionRepository repo,
                                 PrdFileStore fileStore,
                                 PrdArtifactService artifactService,
                                 ObjectMapper mapper) {
        this.repo = repo;
        this.fileStore = fileStore;
        this.artifactService = artifactService;
        this.mapper = mapper;
    }

    /** 基于最新修订内容创建新的后台修订节点。 */
    public PrdSession create(String parentId, String changeReason) throws IOException {
        PrdSession parent = requireParent(parentId);
        PrdSession source = repo.findLatestRevision(parentId).orElse(parent);
        return create(parent, source, changeReason, fileStore.read(source.getId()));
    }

    /**
     * 将旧链路已经原地覆盖的根 PRD 提升为修订节点，并从最新备份恢复根 PRD。
     */
    public PrdSession recoverInPlaceUpdate(String parentId, String changeReason) throws IOException {
        PrdSession parent = requireParent(parentId);
        PrdSession metadataSource = repo.findLatestRevision(parentId).orElse(parent);
        Path parentPath = fileStore.pathFor(parentId);
        List<Integer> backups = scanBackupVersions(parentPath.getParent(), parentId);
        if (backups.isEmpty()) {
            throw new IllegalStateException("检测到旧版 PRD 已原地更新，但找不到更新前备份，无法安全恢复版本树");
        }
        int latestVersion = backups.getLast();
        Path backupPath = parentPath.resolveSibling(parentId + "-v" + latestVersion + ".md");
        String originalContent = Files.readString(backupPath, StandardCharsets.UTF_8);
        String updatedContent = fileStore.read(parentId);
        if (updatedContent == null || updatedContent.isBlank()) {
            throw new IllegalStateException("检测到旧版 PRD 已更新，但当前新版文件为空，无法提升为修订节点");
        }

        PrdSession revision = create(parent, metadataSource, changeReason, updatedContent);
        try {
            artifactService.write(parentId, PrdArtifactType.PRD, originalContent,
                    PrdArtifactService.ArtifactMetadata.empty());
            log.info("[prd-clarify] 已恢复旧版原地更新为修订树 parentId={} revisionId={} backup={}",
                    parentId, revision.getId(), backupPath);
            return revision;
        } catch (Exception restoreError) {
            throw new IOException("修订子节点已创建，但根 PRD 从备份还原失败: " + restoreError.getMessage(), restoreError);
        }
    }

    private PrdSession create(PrdSession parent,
                              PrdSession metadataSource,
                              String changeReason,
                              String initialPrdContent) throws IOException {
        String parentId = parent.getId();
        int version = repo.nextRevisionNumber(parentId);
        long now = System.currentTimeMillis();
        PrdSession revision = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(parent.getTitle() + "（修订版 v" + version + "）")
                .project(parent.getProject())
                .module(parent.getModule())
                .rawInput("【后台自动修订 — 基于：" + parent.getTitle() + "】\n" + value(changeReason))
                .requirementDetail(parent.getRequirementDetail())
                .businessBackground(parent.getBusinessBackground())
                .businessRequirementType(parent.getBusinessRequirementType())
                .requirementSoftware(parent.getRequirementSoftware())
                .initiatingDepartment(parent.getInitiatingDepartment())
                .requester(parent.getRequester())
                .requestedAt(parent.getRequestedAt())
                .attachments(parent.getAttachments())
                .followUpRecords(parent.getFollowUpRecords())
                .questions(metadataSource.getQuestions())
                .status("DONE")
                .role(parent.getRole())
                .reqType(parent.getReqType())
                .maxQuestions(parent.getMaxQuestions())
                .clarifyMode(parent.getClarifyMode())
                .model(parent.getModel())
                .engine(parent.getEngine())
                .createdByUserId(parent.getCreatedByUserId())
                .parentId(parentId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(revision);
        artifactService.write(revision.getId(), PrdArtifactType.PRD,
                initialPrdContent == null ? "" : initialPrdContent,
                PrdArtifactService.ArtifactMetadata.empty());
        invalidateEffortEstimation(parent, "PRD 已产生新的修订版本");
        return repo.findById(revision.getId()).orElseThrow();
    }

    /** 新修订不会覆盖根 PRD 文件，因此显式使根节点上的旧工时评估失效。 */
    private void invalidateEffortEstimation(PrdSession session, String reason) {
        if (session.getDevDocEstimation() == null || session.getDevDocEstimation().isBlank()) {
            return;
        }
        try {
            JsonNode parsed = mapper.readTree(session.getDevDocEstimation());
            if (parsed instanceof ObjectNode node) {
                node.put("invalidatedAt", System.currentTimeMillis());
                node.put("invalidatedReason", reason);
                repo.updateDevDocEstimation(session.getId(), mapper.writeValueAsString(node));
            }
        } catch (Exception e) {
            log.warn("[prd-clarify] 标记旧工时评估失效失败 sessionId={}", session.getId(), e);
        }
    }

    private PrdSession requireParent(String parentId) {
        return repo.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("父 PRD 会话不存在: " + parentId));
    }

    private List<Integer> scanBackupVersions(Path directory, String baseName) {
        if (directory == null || !Files.isDirectory(directory)) {
            return List.of();
        }
        Pattern versionPattern = Pattern.compile(Pattern.quote(baseName) + "-v(\\d+)\\.md");
        try (var files = Files.list(directory)) {
            return files
                    .map(path -> versionPattern.matcher(path.getFileName().toString()))
                    .filter(Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描 PRD 备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
