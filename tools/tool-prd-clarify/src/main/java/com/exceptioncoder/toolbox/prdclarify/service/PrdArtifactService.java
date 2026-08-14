package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Objects;
import java.util.UUID;

/** 一版 PRD 产物的账本登记、原子落盘与旧字段兼容投影。 */
@Service
public class PrdArtifactService {

    private static final int LOCK_STRIPES = 64;

    private final PrdArtifactRepository artifactRepository;
    private final PrdSessionRepository sessionRepository;
    private final PrdFileStore fileStore;
    private final Object[] writeLocks = new Object[LOCK_STRIPES];

    public PrdArtifactService(PrdArtifactRepository artifactRepository,
                              PrdSessionRepository sessionRepository,
                              PrdFileStore fileStore) {
        this.artifactRepository = artifactRepository;
        this.sessionRepository = sessionRepository;
        this.fileStore = fileStore;
        for (int index = 0; index < writeLocks.length; index++) {
            writeLocks[index] = new Object();
        }
    }

    /**
     * 写入一版不可变产物，并刷新兼容旧接口的主文件和路径字段。
     *
     * @param sessionId PRD 会话 ID
     * @param type 产物类型
     * @param content 文件内容，null 按空内容处理
     * @param metadata 生成输入与 Prompt 元数据
     * @return 已进入 READY 的账本记录
     * @throws IOException 文件写入或兼容主文件投影失败
     */
    public PrdArtifact write(String sessionId, PrdArtifactType type, String content,
                             ArtifactMetadata metadata) throws IOException {
        requireIdentity(sessionId, type);
        Object lock = writeLocks[Math.floorMod(Objects.hash(sessionId, type), writeLocks.length)];
        synchronized (lock) {
            return writeLocked(sessionId, type, content, metadata, true);
        }
    }

    /** 将外部工具已写入的兼容主文件登记成新账本版本。 */
    public PrdArtifact captureCanonical(String sessionId, PrdArtifactType type,
                                        ArtifactMetadata metadata) throws IOException {
        requireIdentity(sessionId, type);
        Object lock = writeLocks[Math.floorMod(Objects.hash(sessionId, type), writeLocks.length)];
        synchronized (lock) {
            String canonicalPath = type.canonicalFileName(sessionId);
            String content = fileStore.readRequired(canonicalPath);
            return writeLocked(sessionId, type, content, metadata, false);
        }
    }

    private PrdArtifact writeLocked(String sessionId, PrdArtifactType type, String content,
                                    ArtifactMetadata metadata, boolean refreshCanonical) throws IOException {
        ArtifactMetadata effectiveMetadata = metadata == null ? ArtifactMetadata.empty() : metadata;
        int version = artifactRepository.nextVersion(sessionId, type);
        long now = System.currentTimeMillis();
        PrdArtifact writing = new PrdArtifact(
                UUID.randomUUID().toString(), sessionId, type, version, PrdArtifactState.WRITING,
                type.versionedRelativePath(sessionId, version), null, null,
                effectiveMetadata.sourceHash(), effectiveMetadata.promptVersion(), null, now, now);
        artifactRepository.insertWriting(writing);

        PrdFileStore.StoredFile storedFile;
        try {
            storedFile = fileStore.writeAtomically(writing.relativePath(), content);
            artifactRepository.updateVerification(
                    writing.id(), PrdArtifactState.READY, storedFile.sha256(), storedFile.sizeBytes(), null);
        } catch (IOException | RuntimeException error) {
            recordWritingFailure(writing.id(), error);
            throw error;
        }

        if (refreshCanonical) {
            fileStore.writeAtomically(type.canonicalFileName(sessionId), content);
        }
        updateCompatibilityProjection(sessionId, type);
        return artifactRepository.findById(writing.id())
                .orElseThrow(() -> new IllegalStateException("产物 READY 后账本记录丢失: " + writing.id()));
    }

    private void updateCompatibilityProjection(String sessionId, PrdArtifactType type) {
        String canonicalPath = fileStore.canonicalPathFor(sessionId, type).toString();
        long generatedAt = System.currentTimeMillis();
        switch (type) {
            case PRD -> sessionRepository.updateDone(sessionId, canonicalPath);
            case DEV_DOC -> {
                sessionRepository.updateDevDocPath(sessionId, canonicalPath);
                sessionRepository.updateDevDocGeneratedAt(sessionId, generatedAt);
            }
            case PROGRESS -> {
                sessionRepository.updateProgressPath(sessionId, canonicalPath);
                sessionRepository.updateProgressGeneratedAt(sessionId, generatedAt);
            }
        }
    }

    private void recordWritingFailure(String artifactId, Exception error) {
        try {
            artifactRepository.updateVerification(
                    artifactId, PrdArtifactState.WRITING, null, null, abbreviate(error.getMessage()));
        } catch (Exception ledgerError) {
            error.addSuppressed(ledgerError);
        }
    }

    private void requireIdentity(String sessionId, PrdArtifactType type) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("PRD 会话 ID 不能为空");
        }
        Objects.requireNonNull(type, "产物类型不能为空");
    }

    private String abbreviate(String message) {
        if (message == null) {
            return "产物写入失败";
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    /**
     * 一版产物的可复现元数据。
     *
     * @param sourceHash 生成输入指纹
     * @param promptVersion Prompt 版本
     */
    public record ArtifactMetadata(String sourceHash, String promptVersion) {

        /** 返回尚未接入 Prompt 审计时使用的空元数据。 */
        public static ArtifactMetadata empty() {
            return new ArtifactMetadata(null, null);
        }
    }
}
