package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TurnLifecycleCoordinatorTest {

    @Test
    void staleResultCannotCompleteNewTurn() {
        try (TurnLifecycleCoordinator coordinator = new TurnLifecycleCoordinator()) {
            String oldTurn = coordinator.begin("session-1");
            String newTurn = coordinator.begin("session-1");

            assertNotEquals(oldTurn, newTurn);
            assertFalse(coordinator.complete("session-1", oldTurn));
            assertTrue(coordinator.complete("session-1", newTurn));
        }
    }

    @Test
    void interruptSchedulesQueryAndForceCloseUntilTurnCompletes() throws Exception {
        try (TurnLifecycleCoordinator coordinator = new TurnLifecycleCoordinator(
                Duration.ofMillis(10), Duration.ofMillis(30))) {
            String turnId = coordinator.begin("session-1");
            CountDownLatch query = new CountDownLatch(1);
            CountDownLatch forceClose = new CountDownLatch(1);

            assertTrue(coordinator.requestInterrupt("session-1", turnId, query::countDown, forceClose::countDown));
            assertFalse(coordinator.requestInterrupt("session-1", turnId, query::countDown, forceClose::countDown));
            assertTrue(query.await(1, TimeUnit.SECONDS));
            assertTrue(forceClose.await(1, TimeUnit.SECONDS));
        }
    }

    @Test
    void completionCancelsPendingReconciliation() throws Exception {
        try (TurnLifecycleCoordinator coordinator = new TurnLifecycleCoordinator(
                Duration.ofMillis(50), Duration.ofMillis(80))) {
            String turnId = coordinator.begin("session-1");
            CountDownLatch callback = new CountDownLatch(2);

            coordinator.requestInterrupt("session-1", turnId, callback::countDown, callback::countDown);
            assertTrue(coordinator.complete("session-1", turnId));

            assertFalse(callback.await(150, TimeUnit.MILLISECONDS));
        }
    }
}
