package com.exceptioncoder.toolbox.flatten.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FlattenFile {
    private long id;
    private String scanId;
    private String path;
    private String name;
    private long size;
    /** {@code null} if file's size was unique → no need to hash. Filled for files in size buckets ≥ 2. */
    private String hash;
    private long modifiedAt;
    /** {@code true} if user removed it during dedupe step. */
    private boolean deleted;
    /** Filled when move plan is generated; the conflict-resolved name under {@code targetPath}. */
    private String targetName;
    /** {@code true} once successfully moved on disk. */
    private boolean moved;
    /**
     * In-memory transient flag (not persisted by {@code batchInsert}, not read by ROW mapper):
     * set by {@code MoveEngine} when the move-time collision fallback rewrote {@code targetName}
     * to a timestamped variant, signalling {@code FlattenService} that the new name needs to be
     * pushed back into {@code target_name}.
     */
    private boolean renamed;
}
