package com.exceptioncoder.toolbox.portprocess.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

final class ProcessRunner {

    record Result(int exitCode, List<String> stdout, String stderr) {}

    private ProcessRunner() {}

    static Result run(List<String> command, Charset charset, long timeoutMs) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(false);
        Process p = pb.start();

        StringBuilder err = new StringBuilder();
        Thread errPump = Thread.startVirtualThread(() -> drain(p.getErrorStream(), charset, err::append));

        List<String> out = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), charset))) {
            String line;
            while ((line = r.readLine()) != null) {
                out.add(line);
            }
        }

        boolean finished;
        try {
            finished = p.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
            throw new IOException("interrupted: " + String.join(" ", command));
        }
        if (!finished) {
            p.destroyForcibly();
            throw new IOException("command timed out: " + String.join(" ", command));
        }
        try { errPump.join(timeoutMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        return new Result(p.exitValue(), out, err.toString());
    }

    private static void drain(InputStream in, Charset charset, java.util.function.Consumer<String> sink) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, charset))) {
            String line;
            while ((line = r.readLine()) != null) {
                sink.accept(line);
                sink.accept("\n");
            }
        } catch (IOException ignored) {
        }
    }
}
