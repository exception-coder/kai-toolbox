package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Coordinates admission of new Agent work with a process-wide update drain.
 *
 * <p>The gate protects the short critical section in which accepted work becomes visible to
 * {@link ClaudeChatService#activitySnapshot()}. A drain acquisition takes the same lock, so when
 * it returns, every admission that won the race is already represented by the activity snapshot,
 * while every later admission is rejected. The drain owner can therefore wait for the existing
 * activity to finish without a new turn appearing between its final idle check and restart.
 *
 * <p>A drain lease must be kept open until the update either hands control to the external
 * supervisor or is abandoned. Closing the lease re-opens admissions. Only one drain owner may
 * exist at a time.
 */
@Component
public final class AgentWorkAdmissionGate {

    private final ReentrantLock lock = new ReentrantLock(true);
    private boolean draining;
    private long drainGeneration;

    /**
     * Runs an admission registration atomically with respect to drain acquisition.
     *
     * @param registration action that must make the accepted work visible to the activity snapshot
     * @return {@code false} when a drain already owns the gate; the action is then not invoked
     */
    public boolean tryAdmit(Runnable registration) {
        lock.lock();
        try {
            if (draining) {
                return false;
            }
            registration.run();
            return true;
        } finally {
            lock.unlock();
        }
    }

    /**
     * Starts a drain after any admission registration already in progress has completed.
     *
     * @return the sole drain lease, or empty when another drain is already active
     */
    public Optional<DrainLease> tryAcquireDrain() {
        lock.lock();
        try {
            if (draining) {
                return Optional.empty();
            }
            draining = true;
            long generation = ++drainGeneration;
            return Optional.of(new DrainLease(this, generation));
        } finally {
            lock.unlock();
        }
    }

    public boolean isDraining() {
        lock.lock();
        try {
            return draining;
        } finally {
            lock.unlock();
        }
    }

    private void release(long generation) {
        lock.lock();
        try {
            if (draining && drainGeneration == generation) {
                draining = false;
            }
        } finally {
            lock.unlock();
        }
    }

    /** Exclusive ownership token returned by {@link #tryAcquireDrain()}. */
    public static final class DrainLease implements AutoCloseable {

        private final AgentWorkAdmissionGate owner;
        private final long generation;
        private final AtomicBoolean closed = new AtomicBoolean(false);

        private DrainLease(AgentWorkAdmissionGate owner, long generation) {
            this.owner = owner;
            this.generation = generation;
        }

        @Override
        public void close() {
            if (closed.compareAndSet(false, true)) {
                owner.release(generation);
            }
        }
    }
}
