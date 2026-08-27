package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.SimpleAsyncTaskExecutor;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class GraphifyQueryServiceTest {

    @Test
    void timeoutTerminatesAProcessWhoseOutputNeverCloses() throws Exception {
        BlockingProcess process = new BlockingProcess();
        SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor("graphify-test-");

        long startedAt = System.nanoTime();
        GraphifyQueryService.ProcessOutput result = GraphifyQueryService.await(process, 1, executor);

        assertThat(result.timedOut()).isTrue();
        assertThat(process.isAlive()).isFalse();
        assertThat(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - startedAt)).isLessThan(3);
        executor.close();
    }

    private static final class BlockingProcess extends Process {

        private final PipedInputStream input = new PipedInputStream();
        private final PipedOutputStream producer;
        private volatile boolean alive = true;

        private BlockingProcess() throws Exception {
            producer = new PipedOutputStream(input);
        }

        @Override
        public OutputStream getOutputStream() {
            return new ByteArrayOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return input;
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public int waitFor() throws InterruptedException {
            while (alive) {
                Thread.sleep(10);
            }
            return 137;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            if (!alive) {
                return true;
            }
            unit.sleep(timeout);
            return !alive;
        }

        @Override
        public int exitValue() {
            if (alive) {
                throw new IllegalThreadStateException("still running");
            }
            return 137;
        }

        @Override
        public void destroy() {
            destroyForcibly();
        }

        @Override
        public Process destroyForcibly() {
            alive = false;
            try {
                producer.close();
            } catch (Exception ignored) {
            }
            return this;
        }

        @Override
        public boolean isAlive() {
            return alive;
        }
    }
}
