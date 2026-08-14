package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RestartHandoffTest {

    @TempDir
    Path tempDir;

    @Test
    void leavesNormalApplicationArgumentsUntouched() {
        String[] args = {"--server.port=19090", "plain"};

        RestartHandoff.Parsed parsed = RestartHandoff.parse(args);

        assertTrue(parsed.request().isEmpty());
        assertArrayEquals(args, parsed.applicationArgs());
    }

    @Test
    void stripsCompleteInternalProtocolFromApplicationArguments() {
        Path ready = tempDir.resolve("ready.properties");
        String[] args = {
                RestartHandoff.PROTOCOL_ARG + RestartHandoff.PROTOCOL_VERSION,
                RestartHandoff.PARENT_PID_ARG + "12345",
                RestartHandoff.READY_FILE_ARG + ready,
                RestartHandoff.NONCE_ARG + "abc123",
                RestartHandoff.TIMEOUT_ARG + "5000",
                "--spring.profiles.active=test"
        };

        RestartHandoff.Parsed parsed = RestartHandoff.parse(args);

        assertTrue(parsed.request().isPresent());
        assertEquals(12345L, parsed.request().orElseThrow().parentPid());
        assertEquals(ready.toAbsolutePath().normalize(), parsed.request().orElseThrow().readyFile());
        assertArrayEquals(new String[]{"--spring.profiles.active=test"}, parsed.applicationArgs());
    }

    @Test
    void rejectsPartialOrDuplicateInternalProtocol() {
        assertThrows(IllegalArgumentException.class, () -> RestartHandoff.parse(new String[]{
                RestartHandoff.PARENT_PID_ARG + "123"
        }));
        assertThrows(IllegalArgumentException.class, () -> RestartHandoff.parse(new String[]{
                RestartHandoff.PROTOCOL_ARG + RestartHandoff.PROTOCOL_VERSION,
                RestartHandoff.PROTOCOL_ARG + RestartHandoff.PROTOCOL_VERSION
        }));
    }

    @Test
    void absentParentDoesNotBlockSpringStartupAndCleansHandshakeFile() throws Exception {
        Path ready = tempDir.resolve("ready.properties");
        String[] applicationArgs = RestartHandoff.awaitParentAndStrip(new String[]{
                RestartHandoff.PROTOCOL_ARG + RestartHandoff.PROTOCOL_VERSION,
                RestartHandoff.PARENT_PID_ARG + Long.MAX_VALUE,
                RestartHandoff.READY_FILE_ARG + ready,
                RestartHandoff.NONCE_ARG + "dead-parent",
                RestartHandoff.TIMEOUT_ARG + "1000",
                "--server.port=0"
        });

        assertArrayEquals(new String[]{"--server.port=0"}, applicationArgs);
        assertFalse(java.nio.file.Files.exists(ready));
    }
}
