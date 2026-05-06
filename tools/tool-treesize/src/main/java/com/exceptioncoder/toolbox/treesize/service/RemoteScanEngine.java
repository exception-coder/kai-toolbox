package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

@Component
public class RemoteScanEngine {

    private static final int PROGRESS_THROTTLE_MS = 200;
    private static final char SEP = 0x1F;

    private final SshClientFactory ssh;

    public RemoteScanEngine(SshClientFactory ssh) {
        this.ssh = ssh;
    }

    public ScanEngine.Totals scan(String scanId,
                                  SshHost host,
                                  String rootPath,
                                  Consumer<FileNode> onNode,
                                  Consumer<ScanProgress> onProgress,
                                  BooleanSupplier cancelled) throws Exception {
        Session session = null;
        ChannelExec channel = null;
        try {
            session = ssh.openSession(host);
            channel = (ChannelExec) session.openChannel("exec");
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            channel.setCommand(scanCommand(rootPath));
            channel.setInputStream(null);
            channel.setErrStream(err);
            InputStream in = channel.getInputStream();
            channel.connect();

            ScanState state = new ScanState(scanId, normalizeRoot(rootPath), onNode, onProgress);
            readRecords(in, state, cancelled);

            while (!channel.isClosed()) {
                if (cancelled.getAsBoolean()) {
                    channel.disconnect();
                    throw new CancellationException();
                }
                Thread.sleep(50);
            }
            if (channel.getExitStatus() != 0) {
                String msg = err.toString(StandardCharsets.UTF_8);
                throw new IOException(msg.isBlank() ? "remote find command failed" : msg.trim());
            }
            state.finishDirectories();
            return new ScanEngine.Totals(state.files, state.dirs, state.size);
        } finally {
            if (channel != null) channel.disconnect();
            if (session != null) session.disconnect();
        }
    }

    private static void readRecords(InputStream in, ScanState state, BooleanSupplier cancelled) throws IOException {
        ByteArrayOutputStream record = new ByteArrayOutputStream(512);
        int b;
        while ((b = in.read()) != -1) {
            if (cancelled.getAsBoolean()) {
                throw new CancellationException();
            }
            if (b == 0) {
                state.accept(record.toString(StandardCharsets.UTF_8));
                record.reset();
            } else {
                record.write(b);
            }
        }
        if (record.size() > 0) {
            state.accept(record.toString(StandardCharsets.UTF_8));
        }
    }

    private static String scanCommand(String rootPath) {
        String quoted = shellQuote(rootPath);
        // -prune stops find from descending into these dirs, so /proc/* patterns are redundant and unsafe
        // (shell would glob-expand /proc/* into actual entries, breaking find's argument parsing)
        String prune = "\\( -path /proc -o -path /sys -o -path /dev -o -path /run \\) -prune -o";
        return "LC_ALL=C find -P " + quoted + " " + prune
                + " -printf '%y\\037%s\\037%b\\037%T@\\037%p\\0'";
    }

    private static String shellQuote(String s) {
        return "'" + s.replace("'", "'\"'\"'") + "'";
    }

    private static String normalizeRoot(String root) {
        if (root.length() > 1 && root.endsWith("/")) {
            return root.substring(0, root.length() - 1);
        }
        return root;
    }

    private static final class ScanState {
        private final String scanId;
        private final String root;
        private final Consumer<FileNode> onNode;
        private final Consumer<ScanProgress> onProgress;
        private final Map<String, Accum> accum = new HashMap<>();
        private long lastProgressAt = System.currentTimeMillis();
        private long files;
        private long dirs;
        private long size;

        private ScanState(String scanId, String root, Consumer<FileNode> onNode, Consumer<ScanProgress> onProgress) {
            this.scanId = scanId;
            this.root = root;
            this.onNode = onNode;
            this.onProgress = onProgress;
        }

        private void accept(String raw) {
            String[] parts = raw.split(String.valueOf(SEP), 5);
            if (parts.length != 5) return;
            String type = parts[0];
            long apparentSize = parseLong(parts[1]);
            long allocatedSize = parseLong(parts[2]) * 512L;
            Long modifiedAt = parseUnixMillis(parts[3]);
            String path = normalizeRoot(parts[4]);
            String parent = parentPath(path);
            String name = nameOf(path);
            int depth = depthOf(path);

            if ("d".equals(type)) {
                Accum dir = accum.computeIfAbsent(path, k -> new Accum());
                dir.path = path;
                dir.parent = path.equals(root) ? null : parent;
                dir.name = path.equals(root) ? root : name;
                dir.depth = depth;
                dir.modifiedAt = modifiedAt;
                throttle(path);
                return;
            }

            long ownSize = allocatedSize > 0 ? allocatedSize : apparentSize;
            files += 1;
            size += ownSize;
            if (parent != null) {
                Accum p = accum.computeIfAbsent(parent, k -> new Accum());
                p.size += ownSize;
                p.files += 1;
            }
            onNode.accept(FileNode.builder()
                    .scanId(scanId)
                    .parentPath(parent)
                    .path(path)
                    .name(name)
                    .dir(false)
                    .size(ownSize)
                    .modifiedAt(modifiedAt)
                    .depth(depth)
                    .build());
            throttle(path);
        }

        private void finishDirectories() {
            new java.util.ArrayList<>(accum.values()).stream()
                    .filter(a -> a.path != null)
                    .sorted((a, b) -> Integer.compare(b.depth, a.depth))
                    .forEach(done -> {
                        dirs += 1;
                        onNode.accept(FileNode.builder()
                                .scanId(scanId)
                                .parentPath(done.parent)
                                .path(done.path)
                                .name(done.name)
                                .dir(true)
                                .size(done.size)
                                .fileCount(done.files)
                                .dirCount(done.dirs)
                                .modifiedAt(done.modifiedAt)
                                .depth(done.depth)
                                .build());
                        if (done.parent != null) {
                            Accum parent = accum.computeIfAbsent(done.parent, k -> new Accum());
                            parent.size += done.size;
                            parent.files += done.files;
                            parent.dirs += done.dirs + 1;
                        }
                    });
        }

        private void throttle(String currentPath) {
            long now = System.currentTimeMillis();
            if (now - lastProgressAt >= PROGRESS_THROTTLE_MS) {
                lastProgressAt = now;
                onProgress.accept(new ScanProgress(files + dirs, size, currentPath));
            }
        }

        private String parentPath(String path) {
            if (path.equals(root)) return null;
            int idx = path.lastIndexOf('/');
            if (idx <= 0) return "/";
            return path.substring(0, idx);
        }

        private String nameOf(String path) {
            if ("/".equals(path)) return "/";
            int idx = path.lastIndexOf('/');
            return idx < 0 ? path : path.substring(idx + 1);
        }

        private int depthOf(String path) {
            if (path.equals(root)) return 0;
            String tail = path.startsWith(root) ? path.substring(root.length()) : path;
            tail = tail.replaceAll("^/+", "");
            if (tail.isBlank()) return 0;
            return tail.split("/").length;
        }

        private static long parseLong(String s) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException e) {
                return 0L;
            }
        }

        private static Long parseUnixMillis(String s) {
            try {
                return Math.round(Double.parseDouble(s) * 1000);
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    private static final class Accum {
        String path;
        String parent;
        String name;
        int depth;
        Long modifiedAt;
        long size;
        long files;
        long dirs;
    }
}
