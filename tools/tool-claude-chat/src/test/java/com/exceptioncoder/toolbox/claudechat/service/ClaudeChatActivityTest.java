package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ClaudeChatActivityTest {

    @Test
    void allowsRestartOnlyWhenEveryActivitySourceIsIdle() {
        ClaudeChatActivityView snapshot = ClaudeChatService.summarizeActivity(List.of(), 0, 123L);

        assertThat(snapshot.active()).isFalse();
        assertThat(snapshot.safeToRestart()).isTrue();
        assertThat(snapshot.activeSessionCount()).isZero();
        assertThat(snapshot.oneShotCount()).isZero();
        assertThat(snapshot.observedAt()).isEqualTo(123L);
    }

    @Test
    void countsRunningPendingAndBackgroundSessionsWithoutDoubleCountingActiveSessions() {
        ClaudeChatActivityView snapshot = ClaudeChatService.summarizeActivity(List.of(
                new ClaudeChatService.ActivitySample(true, false, false, 0),
                new ClaudeChatService.ActivitySample(false, false, true, 0),
                new ClaudeChatService.ActivitySample(false, false, false, 2),
                new ClaudeChatService.ActivitySample(true, false, true, 3),
                new ClaudeChatService.ActivitySample(false, false, false, 0)
        ), 0, 456L);

        assertThat(snapshot.active()).isTrue();
        assertThat(snapshot.safeToRestart()).isFalse();
        assertThat(snapshot.activeSessionCount()).isEqualTo(4);
        assertThat(snapshot.runningTurnCount()).isEqualTo(2);
        assertThat(snapshot.pendingRequestCount()).isEqualTo(2);
        assertThat(snapshot.backgroundTaskCount()).isEqualTo(5);
    }

    @Test
    void blocksRestartWhileInterruptedSessionStateIsStillUnconfirmed() {
        ClaudeChatActivityView snapshot = ClaudeChatService.summarizeActivity(List.of(
                new ClaudeChatService.ActivitySample(false, true, false, 0)
        ), 0, 654L);

        assertThat(snapshot.active()).isTrue();
        assertThat(snapshot.safeToRestart()).isFalse();
        assertThat(snapshot.activeSessionCount()).isOne();
        assertThat(snapshot.runningTurnCount()).isZero();
        assertThat(snapshot.uncertainSessionCount()).isOne();
    }

    @Test
    void blocksRestartForOneShotWorkEvenWithoutPersistentSessions() {
        ClaudeChatActivityView snapshot = ClaudeChatService.summarizeActivity(List.of(), 2, 789L);

        assertThat(snapshot.active()).isTrue();
        assertThat(snapshot.safeToRestart()).isFalse();
        assertThat(snapshot.activeSessionCount()).isZero();
        assertThat(snapshot.oneShotCount()).isEqualTo(2);
    }
}
