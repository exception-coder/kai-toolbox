package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PrdDevDocWorkProgressServiceTest {

    @Test
    void persistsRecoverableMarkdownSnapshotBeforeTaskCompletes() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdDevDocWorkProgressService.Tracker tracker =
                new PrdDevDocWorkProgressService(repository).begin("session");
        String snapshot = "x".repeat(PrdDevDocWorkProgressService.SNAPSHOT_CHARACTER_INTERVAL);

        tracker.phase("Codex 正在生成执行计划");
        tracker.append(snapshot);

        verify(repository).updateDevDocWorkSnapshot(
                eq("session"), eq("GENERATING"), eq(null),
                eq("Codex 正在生成执行计划"), eq(snapshot), anyLong());
    }

    @Test
    void keepsPartialSnapshotOnFailureAndClearsItAfterSuccess() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdDevDocWorkProgressService service = new PrdDevDocWorkProgressService(repository);
        PrdDevDocWorkProgressService.Tracker failed = service.begin("failed");
        failed.append("partial markdown");

        failed.fail(new IllegalStateException("agent stopped"));
        service.begin("done").complete();

        verify(repository).updateDevDocWorkSnapshot(
                eq("failed"), eq("ERROR"), eq("agent stopped"), eq("执行计划生成失败"),
                eq("partial markdown"), anyLong());
        verify(repository).updateDevDocWorkSnapshot(
                eq("done"), eq("DONE"), eq(null), eq("执行计划已生成"), eq(null), anyLong());
    }
}
