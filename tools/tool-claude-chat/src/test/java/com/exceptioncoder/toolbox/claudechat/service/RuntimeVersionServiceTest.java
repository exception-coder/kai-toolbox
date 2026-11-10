package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeVersionServiceTest {

    @Test
    void reportsPendingCommitsAfterSourceMovesAhead() {
        List<String> heads = new ArrayList<>(List.of("aaa", "aaa", "bbb"));
        Function<List<String>, String> git = args -> switch (args.get(0)) {
            case "rev-parse" -> heads.remove(0);
            case "rev-list" -> "2";
            case "log" -> "b2 fix: second\nb1 feat: first";
            default -> throw new IllegalArgumentException(args.toString());
        };
        var service = new RuntimeVersionService(git, 10L);

        var same = service.current(true);
        assertThat(same.startedCommit()).isEqualTo("aaa");
        assertThat(same.pendingCommits()).isZero();

        var ahead = service.current(true);
        assertThat(ahead.sourceHead()).isEqualTo("bbb");
        assertThat(ahead.pendingCommits()).isEqualTo(2);
        assertThat(ahead.pendingSubjects()).containsExactly("b2 fix: second", "b1 feat: first");
        assertThat(ahead.error()).isNull();
    }

    @Test
    void explainsWhenStartupDirectoryIsNotAGitRepository() {
        var service = new RuntimeVersionService(args -> { throw new IllegalStateException("not a git repository"); }, 10L);
        var version = service.current(false);
        assertThat(version.startedCommit()).isNull();
        assertThat(version.pendingCommits()).isNull();
        assertThat(version.error()).contains("无法核对运行版本");
    }

    @Test
    void cachesWithinWindowUnlessRefreshRequested() {
        int[] calls = {0};
        var service = new RuntimeVersionService(args -> { calls[0]++; return "aaa"; }, 10L);
        service.current(false);
        service.current(false);
        assertThat(calls[0]).isEqualTo(2); // 启动记录 1 次 + 首次查询 1 次
        service.current(true);
        assertThat(calls[0]).isEqualTo(3);
    }
}
