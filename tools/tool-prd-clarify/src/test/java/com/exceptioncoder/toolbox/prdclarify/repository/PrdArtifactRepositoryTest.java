package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class PrdArtifactRepositoryTest {

    private PrdArtifactRepository repository;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        createArtifactTable(jdbc);
        repository = new PrdArtifactRepository(jdbc);
    }

    @Test
    void allocatesVersionsAndPersistsVerificationState() {
        PrdArtifact writing = artifact("artifact-1", 1);

        repository.insertWriting(writing);
        repository.updateVerification(
                writing.id(), PrdArtifactState.READY, "abc123", 12L, null);

        assertThat(repository.nextVersion("session-1", PrdArtifactType.PRD)).isEqualTo(2);
        assertThat(repository.findLatest("session-1", PrdArtifactType.PRD))
                .get()
                .satisfies(saved -> {
                    assertThat(saved.state()).isEqualTo(PrdArtifactState.READY);
                    assertThat(saved.sha256()).isEqualTo("abc123");
                    assertThat(saved.sizeBytes()).isEqualTo(12L);
                });
    }

    @Test
    void rejectsDuplicateVersionForSameSessionAndType() {
        repository.insertWriting(artifact("artifact-1", 1));

        assertThatThrownBy(() -> repository.insertWriting(artifact("artifact-2", 1)))
                .isInstanceOf(DataAccessException.class);
    }

    public static void createArtifactTable(JdbcTemplate jdbc) {
        jdbc.execute("""
                CREATE TABLE prd_artifact (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    state TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    sha256 TEXT,
                    size_bytes INTEGER,
                    source_hash TEXT,
                    prompt_version TEXT,
                    last_error TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (session_id, artifact_type, version)
                )
                """);
    }

    private PrdArtifact artifact(String id, int version) {
        return new PrdArtifact(
                id, "session-1", PrdArtifactType.PRD, version, PrdArtifactState.WRITING,
                PrdArtifactType.PRD.versionedRelativePath("session-1", version),
                null, null, null, null, null, 1L, 1L);
    }
}
