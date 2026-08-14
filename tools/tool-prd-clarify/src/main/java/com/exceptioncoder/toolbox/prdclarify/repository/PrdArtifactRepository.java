package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** PRD 产物账本的数据访问层。 */
@Repository
public class PrdArtifactRepository {

    private static final RowMapper<PrdArtifact> ROW_MAPPER = (resultSet, rowNumber) -> {
        long sizeBytesValue = resultSet.getLong("size_bytes");
        Long sizeBytes = resultSet.wasNull() ? null : sizeBytesValue;
        return new PrdArtifact(
                resultSet.getString("id"),
                resultSet.getString("session_id"),
                PrdArtifactType.valueOf(resultSet.getString("artifact_type")),
                resultSet.getInt("version"),
                PrdArtifactState.valueOf(resultSet.getString("state")),
                resultSet.getString("relative_path"),
                resultSet.getString("sha256"),
                sizeBytes,
                resultSet.getString("source_hash"),
                resultSet.getString("prompt_version"),
                resultSet.getString("last_error"),
                resultSet.getLong("created_at"),
                resultSet.getLong("updated_at"));
    };

    private final JdbcTemplate jdbc;

    public PrdArtifactRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 返回指定会话和产物类型的下一版本号。 */
    public int nextVersion(String sessionId, PrdArtifactType type) {
        Integer current = jdbc.queryForObject("""
                SELECT COALESCE(MAX(version), 0)
                FROM prd_artifact
                WHERE session_id = ? AND artifact_type = ?
                """, Integer.class, sessionId, type.name());
        return (current == null ? 0 : current) + 1;
    }

    /** 插入一条尚待文件写入完成的账本记录。 */
    public void insertWriting(PrdArtifact artifact) {
        jdbc.update("""
                INSERT INTO prd_artifact (
                    id, session_id, artifact_type, version, state, relative_path,
                    sha256, size_bytes, source_hash, prompt_version, last_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                artifact.id(), artifact.sessionId(), artifact.type().name(), artifact.version(),
                artifact.state().name(), artifact.relativePath(), artifact.sha256(), artifact.sizeBytes(),
                artifact.sourceHash(), artifact.promptVersion(), artifact.lastError(),
                artifact.createdAt(), artifact.updatedAt());
    }

    /** 用文件核验结果推进账本状态。 */
    public void updateVerification(String id, PrdArtifactState state, String sha256,
                                   Long sizeBytes, String lastError) {
        jdbc.update("""
                UPDATE prd_artifact
                SET state = ?, sha256 = ?, size_bytes = ?, last_error = ?, updated_at = ?
                WHERE id = ?
                """, state.name(), sha256, sizeBytes, lastError, System.currentTimeMillis(), id);
    }

    /** 返回一条账本记录。 */
    public Optional<PrdArtifact> findById(String id) {
        return jdbc.query("""
                SELECT id, session_id, artifact_type, version, state, relative_path,
                       sha256, size_bytes, source_hash, prompt_version, last_error, created_at, updated_at
                FROM prd_artifact
                WHERE id = ?
                """, ROW_MAPPER, id).stream().findFirst();
    }

    /** 返回指定会话和类型的最新版本。 */
    public Optional<PrdArtifact> findLatest(String sessionId, PrdArtifactType type) {
        return jdbc.query("""
                SELECT id, session_id, artifact_type, version, state, relative_path,
                       sha256, size_bytes, source_hash, prompt_version, last_error, created_at, updated_at
                FROM prd_artifact
                WHERE session_id = ? AND artifact_type = ?
                ORDER BY version DESC
                LIMIT 1
                """, ROW_MAPPER, sessionId, type.name()).stream().findFirst();
    }

    /** 返回所有需要与磁盘事实核验的记录。 */
    public List<PrdArtifact> findAllForReconciliation() {
        return jdbc.query("""
                SELECT id, session_id, artifact_type, version, state, relative_path,
                       sha256, size_bytes, source_hash, prompt_version, last_error, created_at, updated_at
                FROM prd_artifact
                ORDER BY created_at ASC
                """, ROW_MAPPER);
    }

    /** 返回账本登记的全部相对路径。 */
    public List<String> findAllRelativePaths() {
        return jdbc.queryForList("SELECT relative_path FROM prd_artifact", String.class);
    }
}
