package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** 启动时核验产物账本和不可变文件，并收敛中断写入状态。 */
@Component
@DependsOn({"schemaInitializer", "prdFileStore"})
public class PrdArtifactReconciler {

    private static final Logger log = LoggerFactory.getLogger(PrdArtifactReconciler.class);

    private final PrdArtifactRepository repository;
    private final PrdFileStore fileStore;

    public PrdArtifactReconciler(PrdArtifactRepository repository, PrdFileStore fileStore) {
        this.repository = repository;
        this.fileStore = fileStore;
    }

    @PostConstruct
    public void reconcileOnStartup() {
        try {
            ReconciliationReport report = reconcileAll();
            log.info("[prd-clarify] 产物账本核验完成 ready={} missing={} corrupt={} orphan={}",
                    report.ready(), report.missing(), report.corrupt(), report.orphanPaths().size());
            if (!report.orphanPaths().isEmpty()) {
                log.warn("[prd-clarify] 检测到未登记产物文件，仅报告不删除 paths={}", report.orphanPaths());
            }
        } catch (Exception error) {
            log.warn("[prd-clarify] 产物账本启动核验失败，应用继续启动", error);
        }
    }

    /** 核验所有账本记录，并返回状态计数和孤儿路径。 */
    public ReconciliationReport reconcileAll() throws IOException {
        int ready = 0;
        int missing = 0;
        int corrupt = 0;
        List<PrdArtifact> artifacts = repository.findAllForReconciliation();
        for (PrdArtifact artifact : artifacts) {
            PrdArtifactState state = reconcileOne(artifact);
            switch (state) {
                case READY -> ready++;
                case MISSING -> missing++;
                case CORRUPT -> corrupt++;
                case WRITING -> throw new IllegalStateException("核验后不应保留 WRITING: " + artifact.id());
            }
        }

        Set<String> registeredPaths = new HashSet<>(repository.findAllRelativePaths());
        List<String> orphanPaths = fileStore.listArtifactRelativePaths().stream()
                .filter(path -> !registeredPaths.contains(path))
                .toList();
        return new ReconciliationReport(ready, missing, corrupt, orphanPaths);
    }

    private PrdArtifactState reconcileOne(PrdArtifact artifact) throws IOException {
        Optional<PrdFileStore.StoredFile> inspected = fileStore.inspect(artifact.relativePath());
        if (inspected.isEmpty()) {
            repository.updateVerification(
                    artifact.id(), PrdArtifactState.MISSING, artifact.sha256(), artifact.sizeBytes(),
                    "账本文件不存在");
            return PrdArtifactState.MISSING;
        }

        PrdFileStore.StoredFile file = inspected.get();
        if (artifact.sha256() == null || artifact.sha256().isBlank()
                || artifact.sha256().equals(file.sha256())) {
            repository.updateVerification(
                    artifact.id(), PrdArtifactState.READY, file.sha256(), file.sizeBytes(), null);
            return PrdArtifactState.READY;
        }

        repository.updateVerification(
                artifact.id(), PrdArtifactState.CORRUPT, artifact.sha256(), file.sizeBytes(),
                "文件 SHA-256 与账本不一致，实际值=" + file.sha256());
        return PrdArtifactState.CORRUPT;
    }

    /**
     * 一次核验的汇总结果。
     *
     * @param ready READY 数量
     * @param missing MISSING 数量
     * @param corrupt CORRUPT 数量
     * @param orphanPaths 未登记文件相对路径
     */
    public record ReconciliationReport(int ready, int missing, int corrupt, List<String> orphanPaths) {
    }
}
