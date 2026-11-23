package com.exceptioncoder.toolbox.common.git;

import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Real process pipes exercise output backpressure without changing a repository. */
class GitProcessDrainTest {
    @Test
    void drainsStderrBeyondCaptureLimit() throws Exception {
        assertThat(invoke("stderr").stdout()).isEqualTo("done");
    }

    @Test
    void drainsStdoutBeyondCaptureLimit() throws Exception {
        var result = invoke("stdout");
        assertThat(result.stdout()).hasSize(1024);
        assertThat(result.truncated()).isTrue();
    }

    private static GitLogService.Result invoke(String mode) throws Exception {
        var properties = new GitProperties();
        properties.setDiffMaxBytes(1024);
        properties.setTimeoutMs(5000);
        var method = GitLogService.class.getDeclaredMethod("exec", List.class);
        method.setAccessible(true);
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        try {
            return (GitLogService.Result) method.invoke(new GitLogService(properties), List.of(java,
                    "-cp", System.getProperty("java.class.path"), Peer.class.getName(), mode));
        } catch (InvocationTargetException failure) {
            throw (Exception) failure.getCause();
        }
    }

    /** Emits more than the OS pipe buffer, then finishes normally. */
    public static class Peer {
        public static void main(String[] args) throws Exception {
            byte[] bytes = new byte[2 * 1024 * 1024];
            java.util.Arrays.fill(bytes, (byte) 'x');
            if (args[0].equals("stderr")) {
                System.err.write(bytes);
                System.err.flush();
                System.out.print("done");
            } else {
                System.out.write(bytes);
                System.out.flush();
            }
        }
    }
}
