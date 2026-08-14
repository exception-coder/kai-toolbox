package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepositoryTest.createArtifactTable;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class PrdArtifactServiceTest {

    @TempDir
    Path tempDir;

    private JdbcTemplate jdbc;
    private PrdArtifactRepository repository;
    private PrdSessionRepository sessionRepository;
    private PrdFileStore fileStore;

    @BeforeEach
    void setUp() throws IOException {
        jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        createArtifactTable(jdbc);
        repository = new PrdArtifactRepository(jdbc);
        sessionRepository = mock(PrdSessionRepository.class);
        fileStore = new PrdFileStore(tempDir);
        fileStore.init();
    }

    @Test
    void writesImmutableVersionsAndRefreshesCanonicalProjection() throws Exception {
        PrdArtifactService service = new PrdArtifactService(repository, sessionRepository, fileStore);

        PrdArtifact first = service.write(
                "session-1", PrdArtifactType.PRD, "first", new PrdArtifactService.ArtifactMetadata("s1", "v1"));
        PrdArtifact second = service.write(
                "session-1", PrdArtifactType.PRD, "second", new PrdArtifactService.ArtifactMetadata("s2", "v1"));

        assertThat(first.version()).isEqualTo(1);
        assertThat(second.version()).isEqualTo(2);
        assertThat(first.state()).isEqualTo(PrdArtifactState.READY);
        assertThat(fileStore.readRequired(first.relativePath())).isEqualTo("first");
        assertThat(fileStore.readRequired(second.relativePath())).isEqualTo("second");
        assertThat(Files.readString(fileStore.canonicalPathFor("session-1", PrdArtifactType.PRD)))
                .isEqualTo("second");
        verify(sessionRepository, times(2)).updateDone(
                "session-1", fileStore.canonicalPathFor("session-1", PrdArtifactType.PRD).toString());
    }

    @Test
    void reconcilesFileThatWasMovedBeforeReadyUpdateFailed() throws Exception {
        PrdArtifactRepository failingRepository = new ReadyUpdateFailingRepository(jdbc);
        PrdArtifactService service = new PrdArtifactService(failingRepository, sessionRepository, fileStore);

        assertThatThrownBy(() -> service.write(
                "session-2", PrdArtifactType.DEV_DOC, "content", PrdArtifactService.ArtifactMetadata.empty()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("simulated READY failure");

        PrdArtifact writing = repository.findLatest("session-2", PrdArtifactType.DEV_DOC).orElseThrow();
        assertThat(writing.state()).isEqualTo(PrdArtifactState.WRITING);
        assertThat(fileStore.inspect(writing.relativePath())).isPresent();

        PrdArtifactReconciler.ReconciliationReport report =
                new PrdArtifactReconciler(repository, fileStore).reconcileAll();

        assertThat(report.ready()).isEqualTo(1);
        assertThat(repository.findById(writing.id()).orElseThrow().state())
                .isEqualTo(PrdArtifactState.READY);
    }

    @Test
    void marksInterruptedWriteMissingAndRejectsPathEscape() throws Exception {
        PrdFileStore failingStore = spy(new PrdFileStore(tempDir));
        failingStore.init();
        doThrow(new IOException("simulated file failure"))
                .when(failingStore).writeAtomically(anyString(), anyString());
        PrdArtifactService service = new PrdArtifactService(repository, sessionRepository, failingStore);

        assertThatThrownBy(() -> service.write(
                "session-3", PrdArtifactType.PROGRESS, "content", PrdArtifactService.ArtifactMetadata.empty()))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("simulated file failure");

        PrdArtifact writing = repository.findLatest("session-3", PrdArtifactType.PROGRESS).orElseThrow();
        PrdArtifactReconciler.ReconciliationReport report =
                new PrdArtifactReconciler(repository, fileStore).reconcileAll();
        assertThat(report.missing()).isEqualTo(1);
        assertThat(repository.findById(writing.id()).orElseThrow().state())
                .isEqualTo(PrdArtifactState.MISSING);
        assertThatThrownBy(() -> fileStore.writeAtomically("../escape.md", "blocked"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("路径越界");
    }

    private static final class ReadyUpdateFailingRepository extends PrdArtifactRepository {

        private boolean failReady = true;

        private ReadyUpdateFailingRepository(JdbcTemplate jdbc) {
            super(jdbc);
        }

        @Override
        public void updateVerification(String id, PrdArtifactState state, String sha256,
                                       Long sizeBytes, String lastError) {
            if (state == PrdArtifactState.READY && failReady) {
                failReady = false;
                throw new IllegalStateException("simulated READY failure");
            }
            super.updateVerification(id, state, sha256, sizeBytes, lastError);
        }
    }
}
