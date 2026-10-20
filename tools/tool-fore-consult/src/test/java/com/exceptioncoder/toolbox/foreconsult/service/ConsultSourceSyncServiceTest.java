package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.git.GitPullOperations;
import com.exceptioncoder.toolbox.common.git.GitPullPreview;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultSourceSyncServiceTest {
    @TempDir Path root;
    ConsultSourceRoutingService routing;
    GitPullOperations git;
    ConsultSourceSyncService service;

    @BeforeEach @SuppressWarnings("unchecked") void setup() throws Exception {
        Files.createDirectory(root.resolve(".git"));
        routing = mock(ConsultSourceRoutingService.class);
        git = mock(GitPullOperations.class);
        ObjectProvider<GitPullOperations> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(git);
        when(routing.rootForRuntime("runtime", "project")).thenReturn(root.toRealPath());
        service = new ConsultSourceSyncService(routing, provider);
    }

    GitPullPreview preview(int ahead, int behind, String blocked) {
        return new GitPullPreview("main", "a".repeat(40), "origin", "main", "safe-remote",
                "b".repeat(40), ahead, behind, blocked, "fixed-token");
    }

    @Test void fastForwardsOnceAndRevalidatesAuthorizationOnCachedReads() {
        when(git.prepare(root)).thenReturn(preview(0, 2, ""));
        var first = service.synchronize("runtime", "project");
        assertThat(first.status()).isEqualTo("UPDATED");
        assertThat(first.headAtCheck()).isEqualTo("b".repeat(40));
        assertThat(service.synchronize("runtime", "project")).isEqualTo(first);
        verify(git, times(1)).prepare(root);
        verify(git).pull(root, "fixed-token");
        when(routing.rootForRuntime("runtime", "project")).thenThrow(new IllegalArgumentException("excluded"));
        assertThatThrownBy(() -> service.synchronize("runtime", "project")).hasMessage("excluded");
    }

    @Test void skipsCurrentAndDivergedRepositoriesWithoutPulling() {
        when(git.prepare(root)).thenReturn(preview(1, 1, "diverged"));
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("LOCAL_CHANGES");
        verify(git, never()).pull(any(), any());
    }

    @Test void alreadyCurrentIsEvidenceNotAnUnnecessaryMerge() {
        when(git.prepare(root)).thenReturn(preview(0, 0, "already current"));
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("UP_TO_DATE");
        verify(git, never()).pull(any(), any());
    }

    @Test void preservesLocalChangesAndDoesNotDiscloseCredentialBearingGitFailures() {
        when(git.prepare(root)).thenThrow(new IllegalArgumentException("dirty https://user:secret@host/repo"));
        var result = service.synchronize("runtime", "project");
        assertThat(result.status()).isEqualTo("UNVERIFIED");
        assertThat(result.message()).contains("本地").doesNotContain("secret", "https:");
        verify(git, never()).pull(any(), any());
    }

    @Test void doesNotSearchForOrModifyAParentRepository() throws Exception {
        Files.delete(root.resolve(".git"));
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("LOCAL_ONLY");
        verifyNoInteractions(git);
    }

    @Test void reportsConcurrentCheckWithoutStartingAnotherFetch() throws Exception {
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(git.prepare(root)).thenAnswer(ignored -> {
            started.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("test timeout"); }
            return preview(0, 0, "current");
        });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> service.synchronize("runtime", "project"));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(service.synchronize("runtime", "project").status()).isEqualTo("SYNCING");
            } finally { release.countDown(); }
            assertThat(first.get(5, TimeUnit.SECONDS).status()).isEqualTo("UP_TO_DATE");
        }
        verify(git, times(1)).prepare(root);
    }
    @Test void doesNotFastForwardAfterAccessIsRevokedDuringFetch() {
        when(git.prepare(root)).thenAnswer(ignored -> {
            when(routing.rootForRuntime("runtime", "project")).thenThrow(new IllegalArgumentException("excluded"));
            return preview(0, 1, "");
        });
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("UNVERIFIED");
        verify(git, never()).pull(any(), any());
    }

    @Test void aManualGitOperationInProgressStopsSourceReadsAndCanBeRetried() {
        when(git.prepare(root)).thenThrow(new IllegalStateException("该仓库正在检查、拉取或推送，请等待完成后刷新"))
                .thenReturn(preview(0, 0, "current"));
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("SYNCING");
        assertThat(service.synchronize("runtime", "project").status()).isEqualTo("UP_TO_DATE");
        verify(git, times(2)).prepare(root);
    }

}
