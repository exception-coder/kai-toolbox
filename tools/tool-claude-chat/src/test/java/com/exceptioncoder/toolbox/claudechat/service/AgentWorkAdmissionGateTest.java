package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class AgentWorkAdmissionGateTest {

    @Test
    void drainWaitsForAdmissionRegistrationThenRejectsNewWorkUntilReleased() throws Exception {
        AgentWorkAdmissionGate gate = new AgentWorkAdmissionGate();
        CountDownLatch registrationEntered = new CountDownLatch(1);
        CountDownLatch finishRegistration = new CountDownLatch(1);
        CountDownLatch drainReturned = new CountDownLatch(1);
        AtomicReference<AgentWorkAdmissionGate.DrainLease> lease = new AtomicReference<>();

        Thread admission = Thread.ofVirtual().start(() -> gate.tryAdmit(() -> {
            registrationEntered.countDown();
            await(finishRegistration);
        }));
        assertThat(registrationEntered.await(1, TimeUnit.SECONDS)).isTrue();

        Thread drain = Thread.ofVirtual().start(() -> {
            lease.set(gate.tryAcquireDrain().orElseThrow());
            drainReturned.countDown();
        });
        assertThat(drainReturned.await(100, TimeUnit.MILLISECONDS)).isFalse();

        finishRegistration.countDown();
        admission.join(1_000);
        drain.join(1_000);

        assertThat(drainReturned.getCount()).isZero();
        assertThat(gate.isDraining()).isTrue();
        AtomicBoolean invoked = new AtomicBoolean(false);
        assertThat(gate.tryAdmit(() -> invoked.set(true))).isFalse();
        assertThat(invoked).isFalse();

        lease.get().close();
        assertThat(gate.isDraining()).isFalse();
        assertThat(gate.tryAdmit(() -> invoked.set(true))).isTrue();
        assertThat(invoked).isTrue();
    }

    @Test
    void onlyOneDrainLeaseOwnsTheGateAndCloseIsIdempotent() {
        AgentWorkAdmissionGate gate = new AgentWorkAdmissionGate();
        AgentWorkAdmissionGate.DrainLease first = gate.tryAcquireDrain().orElseThrow();

        assertThat(gate.tryAcquireDrain()).isEmpty();
        first.close();
        first.close();

        Optional<AgentWorkAdmissionGate.DrainLease> second = gate.tryAcquireDrain();
        assertThat(second).isPresent();
        assertThat(gate.isDraining()).isTrue();
        first.close();
        assertThat(gate.isDraining()).isTrue();

        second.orElseThrow().close();
        assertThat(gate.isDraining()).isFalse();
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError(error);
        }
    }
}
