package com.exceptioncoder.toolbox.claudechat.service.storage;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SessionStorageServiceTest {
    @TempDir
    Path home;

    @Test
    void isolatesAccountsWithTheSameThreadAndRestatsGrowingFilesWithoutReadingJson() throws IOException {
        Path accountA = home.resolve(".codex-a");
        Path accountB = home.resolve(".codex-b");
        Path first = record(accountA.resolve("sessions/2026/10/12/rollout-date-shared-id.jsonl"), 17);
        record(accountB.resolve("archived_sessions/rollout-date-shared-id.jsonl"), 29);
        var service = new SessionStorageService(new ObjectMapper(), home);
        var alpha = session("alpha", "codex", "shared-id");
        alpha.setCodexHome(accountA.toString());
        var beta = session("beta", "codex", "shared-id");
        beta.setCodexHome(accountB.toString());

        var initial = service.inspect(List.of(alpha, beta));
        assertThat(initial).extracting(view -> view.bytes()).containsExactly(17L, 29L);
        assertThat(initial).allSatisfy(view -> {
            assertThat(view.status()).isEqualTo("available");
            assertThat(view.fileCount()).isEqualTo(1);
        });
        Files.write(first, new byte[11], StandardOpenOption.APPEND);
        assertThat(service.inspect(List.of(alpha)).getFirst().bytes()).isEqualTo(28L);
    }

    @Test
    void aggregatesSavedNativeHandlesAndExcludesOtherSessionsAndNonRecordFiles() throws IOException {
        var logical = session("logical", "codex", "thread-b");
        logical.setEngineSessions("{\"claude\":\"thread-a\",\"codex\":\"thread-b\",\"pi\":\""
                + home.resolve(".pi/agent/sessions/project/pi-record.jsonl").toString().replace("\\", "\\\\")
                + "\",\"antigravity\":\"thread-d\"}");
        record(home.resolve(".claude/projects/D--work-project/thread-a.jsonl"), 10);
        record(home.resolve(".claude/projects/D--work-project/thread-a/subagents/agent-one.jsonl"), 20);
        record(home.resolve(".claude/projects/D--work-project/thread-a/subagents/non-record.txt"), 300);
        record(home.resolve(".claude/projects/D--work-other/thread-a.jsonl"), 400);
        record(home.resolve(".codex/sessions/2026/10/12/rollout-date-thread-b.jsonl"), 30);
        record(home.resolve(".pi/agent/sessions/project/pi-record.jsonl"), 40);
        record(home.resolve(".gemini/antigravity-cli/brain/thread-d/.system_generated/logs/transcript.jsonl"), 50);

        var view = new SessionStorageService(new ObjectMapper(), home).inspect(List.of(logical)).getFirst();
        assertThat(view.status()).isEqualTo("available");
        assertThat(view.bytes()).isEqualTo(150L);
        assertThat(view.fileCount()).isEqualTo(5);
        assertThat(view.engines()).hasSize(4);
        assertThat(view.description()).contains("不含工作区源码");
        assertThat(new ObjectMapper().writeValueAsString(view)).doesNotContain(home.toString());
    }

    @Test
    void distinguishesZeroMissingPendingAndUnsupportedAndKeepsIncompleteTotalsExplicit() throws IOException {
        record(home.resolve(".codex/sessions/rollout-date-empty.jsonl"), 0);
        var service = new SessionStorageService(new ObjectMapper(), home);
        var views = service.inspect(List.of(session("zero", "codex", "empty"),
                session("missing", "codex", "absent"), session("pending", "codex", null),
                session("unsupported", "opencode", "shared-db-id")));
        assertThat(views).extracting(view -> view.status()).containsExactly("available", "missing", "pending", "unsupported");
        assertThat(views.getFirst().bytes()).isZero();
        assertThat(views.subList(1, 4)).allSatisfy(view -> assertThat(view.bytes()).isNull());
        var partial = session("partial", "codex", "empty");
        partial.setEngineSessions("not-json");
        var partialView = service.inspect(List.of(partial)).getFirst();
        assertThat(partialView.status()).isEqualTo("partial");
        assertThat(partialView.description()).contains("未完整获取");
        partial.setEngineSessions("{\"codex\":\"empty\"}");
        partial.setSdkSessionId(null);
        assertThat(service.inspect(List.of(partial)).getFirst().status()).isEqualTo("available");
    }

    @Test
    void rejectsEscapedHandlesAndReportsTruncatedDirectories() throws IOException {
        var service = new SessionStorageService(new ObjectMapper(), home);
        Path outside = record(home.resolve("other/private.jsonl"), 80);
        assertThat(service.inspect(List.of(session("pi", "pi", outside.toString()))).getFirst().bytes()).isNull();
        assertThat(service.inspect(List.of(session("codex", "codex", "../escape"))).getFirst().status()).isEqualTo("unavailable");
        Path root = home.resolve("bounded");
        record(root.resolve("a/b/deep.jsonl"), 17);
        assertThat(new SessionRecordFiles().scan(root, 1).complete()).isFalse();
        record(root.resolve("visible.jsonl"), 4);
        assertThat(SessionRecordFiles.contained(root, root.resolve("visible.jsonl"))).isEqualTo(root.resolve("visible.jsonl").toRealPath());
        org.junit.jupiter.api.Assertions.assertThrows(IOException.class, () -> SessionRecordFiles.contained(root, outside));
    }

    @Test
    void countsOnlyTheCopilotSessionDirectory() throws IOException {
        record(home.resolve(".copilot/session-state/native/events.jsonl"), 11);
        record(home.resolve(".copilot/session-state/native/checkpoints/one.json"), 13);
        record(home.resolve(".copilot/session-state/other/events.jsonl"), 400);
        record(home.resolve(".copilot/session-store.db"), 800);
        var view = new SessionStorageService(new ObjectMapper(), home)
                .inspect(List.of(session("copilot", "copilot", "native"))).getFirst();
        assertThat(view.bytes()).isEqualTo(24L);
        assertThat(view.fileCount()).isEqualTo(2);
    }

    @Test
    void refusesDirectoryLinksThatRedirectToAnotherSessionRecord() throws Exception {
        Path outside = record(home.resolve("outside/linked.jsonl"), 90).getParent();
        Path root = home.resolve(".claude/projects");
        Files.createDirectories(root);
        Path link = root.resolve("D--work-project");
        if (System.getProperty("os.name").startsWith("Windows")) {
            var creation = new ProcessBuilder("cmd.exe", "/c", "mklink", "/J", link.toString(), outside.toString())
                    .redirectErrorStream(true).start();
            assertThat(creation.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(creation.exitValue()).isZero();
        } else {
            Files.createSymbolicLink(link, outside);
        }
        org.junit.jupiter.api.Assertions.assertThrows(IOException.class,
                () -> SessionRecordFiles.contained(root, link.resolve("linked.jsonl")));
        var view = new SessionStorageService(new ObjectMapper(), home)
                .inspect(List.of(session("linked", "claude", "linked"))).getFirst();
        assertThat(view.bytes()).isNull();
        assertThat(view.status()).isNotEqualTo("available");
    }

    private static ClaudeChatSession session(String id, String engine, String handle) {
        return ClaudeChatSession.builder().id(id).cwd("D:/work/project").engine(engine).sdkSessionId(handle).build();
    }

    private static Path record(Path file, int bytes) throws IOException {
        Files.createDirectories(file.getParent());
        return Files.write(file, new byte[bytes]);
    }
}
