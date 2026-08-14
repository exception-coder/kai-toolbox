package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RestartShutdownTest {

    @Test
    void childThatDiesDuringResponseDelayKeepsCurrentContextAlive() throws Exception {
        RestartProperties properties = new RestartProperties();
        properties.setExitDelay(Duration.ofMillis(20));
        RestartRuntime runtime = mock(RestartRuntime.class);
        ConfigurableApplicationContext context = mock(ConfigurableApplicationContext.class);
        ProcessHandle replacement = mock(ProcessHandle.class);
        when(replacement.isAlive()).thenReturn(true, false);
        CountDownLatch cancelled = new CountDownLatch(1);
        RestartShutdown shutdown = new RestartShutdown(properties, runtime, context);

        shutdown.afterResponse(replacement, cancelled::countDown);

        assertTrue(cancelled.await(2, TimeUnit.SECONDS));
        verify(context, never()).close();
        verify(runtime, never()).exit(org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void liveTakeoverWaiterAllowsOldContextToClose() throws Exception {
        RestartProperties properties = new RestartProperties();
        properties.setExitDelay(Duration.ofMillis(20));
        RestartRuntime runtime = mock(RestartRuntime.class);
        ConfigurableApplicationContext context = mock(ConfigurableApplicationContext.class);
        ProcessHandle replacement = mock(ProcessHandle.class);
        when(replacement.isAlive()).thenReturn(true);
        CountDownLatch exited = new CountDownLatch(1);
        doAnswer(ignored -> {
            exited.countDown();
            return null;
        }).when(runtime).exit(0);
        RestartShutdown shutdown = new RestartShutdown(properties, runtime, context);

        shutdown.afterResponse(replacement, () -> { });

        assertTrue(exited.await(2, TimeUnit.SECONDS));
        verify(context).close();
    }

    @Test
    void alreadyDeadReplacementIsRejectedSynchronously() {
        RestartRuntime runtime = mock(RestartRuntime.class);
        ProcessHandle replacement = mock(ProcessHandle.class);
        when(replacement.isAlive()).thenReturn(false);
        RestartShutdown shutdown = new RestartShutdown(new RestartProperties(), runtime,
                mock(ConfigurableApplicationContext.class));

        assertThrows(IllegalStateException.class,
                () -> shutdown.afterResponse(replacement, () -> { }));
    }
}
