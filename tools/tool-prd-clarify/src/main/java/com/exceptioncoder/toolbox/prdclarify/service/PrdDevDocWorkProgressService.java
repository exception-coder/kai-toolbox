package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.stereotype.Service;

/**
 * 持久化执行计划后台生成的可恢复进度快照。
 *
 * <p>正式文档仍由 {@link PrdArtifactService} 管理；此服务只保存运行中的临时展示状态。
 * 增量正文按字符数或时间节流，避免模型每个 token 都触发 SQLite 写入。</p>
 */
@Service
public class PrdDevDocWorkProgressService {

    static final int SNAPSHOT_CHARACTER_INTERVAL = 256;
    static final long SNAPSHOT_TIME_INTERVAL_MS = 1_000L;

    private final PrdSessionRepository repository;

    public PrdDevDocWorkProgressService(PrdSessionRepository repository) {
        this.repository = repository;
    }

    public Tracker begin(String sessionId) {
        long now = System.currentTimeMillis();
        String initialProgress = "正在准备核心规格与代码知识图谱上下文";
        repository.updateDevDocWorkSnapshot(
                sessionId, "GENERATING", null, initialProgress, "", now);
        return new Tracker(sessionId, initialProgress, now);
    }

    public final class Tracker {
        private final String sessionId;
        private final StringBuilder content = new StringBuilder();
        private String progress;
        private int persistedCharacters;
        private long persistedAt;

        private Tracker(String sessionId, String progress, long persistedAt) {
            this.sessionId = sessionId;
            this.progress = progress;
            this.persistedAt = persistedAt;
        }

        public void phase(String message) {
            progress = message;
            persist();
        }

        public void append(String delta) {
            if (delta == null || delta.isEmpty()) {
                return;
            }
            content.append(delta);
            long now = System.currentTimeMillis();
            if (content.length() - persistedCharacters >= SNAPSHOT_CHARACTER_INTERVAL
                    || now - persistedAt >= SNAPSHOT_TIME_INTERVAL_MS) {
                persist();
            }
        }

        public void complete() {
            repository.updateDevDocWorkSnapshot(
                    sessionId, "DONE", null, "执行计划已生成", null, System.currentTimeMillis());
        }

        public void fail(Throwable error) {
            String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
            repository.updateDevDocWorkSnapshot(
                    sessionId, "ERROR", message, "执行计划生成失败", content.toString(),
                    System.currentTimeMillis());
        }

        private void persist() {
            long now = System.currentTimeMillis();
            repository.updateDevDocWorkSnapshot(
                    sessionId, "GENERATING", null, progress, content.toString(), now);
            persistedCharacters = content.length();
            persistedAt = now;
        }
    }
}
