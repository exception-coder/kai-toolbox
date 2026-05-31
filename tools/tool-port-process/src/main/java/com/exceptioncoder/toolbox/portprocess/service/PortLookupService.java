package com.exceptioncoder.toolbox.portprocess.service;

import com.exceptioncoder.toolbox.portprocess.api.dto.KillResult;
import com.exceptioncoder.toolbox.portprocess.api.dto.PortLookupResult;
import com.exceptioncoder.toolbox.portprocess.api.dto.PortProcessEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

@Service
public class PortLookupService {

    private static final Logger log = LoggerFactory.getLogger(PortLookupService.class);
    private static final long TIMEOUT_MS = 5_000;
    private static final int STREAM_TAIL_BYTES = 1024;
    // PID 保护名单：init / Windows System / kai-toolbox 自身
    private static final Set<Long> PROTECTED_PIDS = Set.of(1L, 4L, ProcessHandle.current().pid());

    /**
     * 终止指定 PID 的进程。
     * force=true：硬终止（Windows /F、Unix kill -9）；
     * force=false：优雅终止（Windows 不带 /F、Unix kill -15）。
     */
    public KillResult kill(long pid, boolean force) {
        if (pid <= 0 || pid > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "pid 必须在 (0, " + Integer.MAX_VALUE + "), got " + pid);
        }
        if (PROTECTED_PIDS.contains(pid)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "拒绝终止系统进程或 kai-toolbox 自身 (pid=" + pid + ")");
        }
        String os = System.getProperty("os.name", "unknown");
        boolean windows = os.toLowerCase(Locale.ROOT).contains("win");
        List<String> cmd;
        if (windows) {
            cmd = force ? List.of("taskkill", "/F", "/PID", String.valueOf(pid))
                        : List.of("taskkill", "/PID", String.valueOf(pid));
        } else if (os.toLowerCase(Locale.ROOT).contains("linux")
                || os.toLowerCase(Locale.ROOT).contains("mac")) {
            cmd = force ? List.of("kill", "-9", String.valueOf(pid))
                        : List.of("kill", "-15", String.valueOf(pid));
        } else {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "不支持的操作系统：" + os);
        }
        Charset cs = windows ? Charset.defaultCharset() : StandardCharsets.UTF_8;
        long t0 = System.currentTimeMillis();
        try {
            ProcessRunner.Result r = ProcessRunner.run(cmd, cs, TIMEOUT_MS);
            String stdout = truncate(String.join("\n", r.stdout()));
            String stderr = truncate(r.stderr());
            return new KillResult(pid, r.exitCode() == 0, os,
                    String.join(" ", cmd), r.exitCode(), stdout, stderr,
                    System.currentTimeMillis() - t0);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "执行终止命令失败：" + e.getMessage(), e);
        }
    }

    private static String truncate(String s) {
        if (s == null) return null;
        if (s.length() <= STREAM_TAIL_BYTES) return s;
        return s.substring(s.length() - STREAM_TAIL_BYTES);
    }

    public PortLookupResult lookup(int port) {
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException("port must be in [1, 65535], got " + port);
        }
        long t0 = System.currentTimeMillis();
        String os = System.getProperty("os.name", "unknown");
        boolean windows = os.toLowerCase(Locale.ROOT).contains("win");
        try {
            if (windows) {
                Probe r = windows(port);
                return new PortLookupResult(port, os, r.command, System.currentTimeMillis() - t0, r.entries);
            }
            Probe r = unix(port);
            return new PortLookupResult(port, os, r.command, System.currentTimeMillis() - t0, r.entries);
        } catch (IOException e) {
            throw new RuntimeException("failed to lookup port " + port + ": " + e.getMessage(), e);
        }
    }

    private record Probe(String command, List<PortProcessEntry> entries) {}

    // ---------------- Windows ----------------

    private Probe windows(int port) throws IOException {
        Charset cs = Charset.defaultCharset();
        ProcessRunner.Result netstat = ProcessRunner.run(
                List.of("netstat", "-ano"), cs, TIMEOUT_MS);
        List<PortProcessEntry> entries = parseNetstatWindows(netstat.stdout(), port);
        Map<Long, String[]> names = resolveTasklistNames(entries, cs);
        List<PortProcessEntry> hydrated = new ArrayList<>(entries.size());
        for (PortProcessEntry e : entries) {
            String[] info = e.pid() == null ? null : names.get(e.pid());
            hydrated.add(new PortProcessEntry(
                    e.protocol(), e.family(), e.localAddress(), e.localPort(),
                    e.remoteAddress(), e.state(), e.pid(),
                    info == null ? null : info[0],
                    info == null ? null : info[1]));
        }
        return new Probe("netstat -ano | tasklist", hydrated);
    }

    private static final Pattern WIN_LINE = Pattern.compile(
            "^\\s*(TCP|UDP)\\s+(\\S+)\\s+(\\S+)(?:\\s+(\\S+))?\\s+(\\d+)\\s*$");

    private List<PortProcessEntry> parseNetstatWindows(List<String> lines, int port) {
        List<PortProcessEntry> out = new ArrayList<>();
        String portSuffix = ":" + port;
        for (String line : lines) {
            Matcher m = WIN_LINE.matcher(line);
            if (!m.matches()) continue;
            String proto = m.group(1);
            String local = m.group(2);
            String foreign = m.group(3);
            String state = "UDP".equals(proto) ? null : m.group(4);
            long pid = Long.parseLong(m.group(5));
            if (!local.endsWith(portSuffix)) continue;
            AddrPort lp = splitAddr(local);
            if (lp.port != port) continue;
            out.add(new PortProcessEntry(proto, family(lp.host), lp.host, lp.port,
                    foreign, state, pid, null, null));
        }
        return out;
    }

    private Map<Long, String[]> resolveTasklistNames(List<PortProcessEntry> entries, Charset cs) {
        Map<Long, String[]> map = new HashMap<>();
        for (PortProcessEntry e : entries) {
            if (e.pid() == null || map.containsKey(e.pid())) continue;
            try {
                ProcessRunner.Result r = ProcessRunner.run(
                        List.of("tasklist", "/NH", "/FI", "PID eq " + e.pid(), "/FO", "CSV"),
                        cs, TIMEOUT_MS);
                String name = null;
                for (String line : r.stdout()) {
                    String trimmed = line.trim();
                    if (trimmed.startsWith("\"")) {
                        String[] cols = trimmed.split("\",\"");
                        if (cols.length > 0) name = cols[0].replace("\"", "");
                        break;
                    }
                }
                map.put(e.pid(), new String[]{name, null});
            } catch (IOException ex) {
                log.debug("tasklist failed for pid {}: {}", e.pid(), ex.getMessage());
                map.put(e.pid(), new String[]{null, null});
            }
        }
        return map;
    }

    // ---------------- Unix (Linux / macOS) ----------------

    private Probe unix(int port) throws IOException {
        try {
            ProcessRunner.Result r = ProcessRunner.run(
                    List.of("lsof", "-nP", "-iTCP:" + port, "-iUDP:" + port),
                    StandardCharsets.UTF_8, TIMEOUT_MS);
            if (r.exitCode() == 0 || !r.stdout().isEmpty()) {
                return new Probe("lsof -nP -iTCP:" + port + " -iUDP:" + port,
                        parseLsof(r.stdout(), port));
            }
            log.debug("lsof returned no rows, falling back. stderr={}", r.stderr());
        } catch (IOException e) {
            log.debug("lsof not available: {}", e.getMessage());
        }

        try {
            ProcessRunner.Result r = ProcessRunner.run(
                    List.of("ss", "-Hatnup", "sport = :" + port),
                    StandardCharsets.UTF_8, TIMEOUT_MS);
            if (r.exitCode() == 0) {
                return new Probe("ss -Hatnup sport = :" + port,
                        parseSs(r.stdout(), port));
            }
        } catch (IOException e) {
            log.debug("ss not available: {}", e.getMessage());
        }

        ProcessRunner.Result r = ProcessRunner.run(
                List.of("netstat", "-anp"), StandardCharsets.UTF_8, TIMEOUT_MS);
        return new Probe("netstat -anp",
                parseNetstatUnix(r.stdout(), port));
    }

    private static final Pattern LSOF_PAREN = Pattern.compile("\\(([^)]+)\\)");

    private List<PortProcessEntry> parseLsof(List<String> lines, int port) {
        List<PortProcessEntry> out = new ArrayList<>();
        String portSuffix = ":" + port;
        for (String line : lines) {
            if (line.isBlank() || line.startsWith("COMMAND")) continue;
            String[] cols = line.trim().split("\\s+");
            if (cols.length < 9) continue;
            String command = cols[0];
            long pid;
            try { pid = Long.parseLong(cols[1]); } catch (NumberFormatException ex) { continue; }
            String type = cols[4];
            String proto = cols[7];
            String name = cols[8];
            int arrow = name.indexOf("->");
            String local = arrow >= 0 ? name.substring(0, arrow) : name;
            String remote = arrow >= 0 ? name.substring(arrow + 2) : null;
            if (!local.endsWith(portSuffix)) continue;
            AddrPort lp = splitAddr(local);
            if (lp.port != port) continue;
            String state = null;
            if (cols.length >= 10) {
                Matcher m = LSOF_PAREN.matcher(cols[9]);
                if (m.find()) state = m.group(1);
            }
            out.add(new PortProcessEntry(proto, type, lp.host, lp.port,
                    remote, state, pid, command, null));
        }
        return out;
    }

    private static final Pattern SS_USERS = Pattern.compile(
            "users:\\(\\(\"([^\"]+)\",pid=(\\d+)");

    private List<PortProcessEntry> parseSs(List<String> lines, int port) {
        List<PortProcessEntry> out = new ArrayList<>();
        String portSuffix = ":" + port;
        for (String line : lines) {
            if (line.isBlank()) continue;
            String[] cols = line.trim().split("\\s+");
            if (cols.length < 5) continue;
            String proto = cols[0].toUpperCase(Locale.ROOT);
            String state = cols[1];
            String local = cols[3];
            String remote = cols[4];
            if (!local.endsWith(portSuffix)) continue;
            AddrPort lp = splitAddr(local);
            if (lp.port != port) continue;
            String name = null;
            Long pid = null;
            Matcher m = SS_USERS.matcher(line);
            if (m.find()) {
                name = m.group(1);
                pid = Long.parseLong(m.group(2));
            }
            out.add(new PortProcessEntry(proto, family(lp.host), lp.host, lp.port,
                    remote, state, pid, name, null));
        }
        return out;
    }

    private static final Pattern UNIX_NETSTAT = Pattern.compile(
            "^(tcp6?|udp6?)\\s+\\d+\\s+\\d+\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)?\\s*(\\d+)?/?(\\S+)?\\s*$",
            Pattern.CASE_INSENSITIVE);

    private List<PortProcessEntry> parseNetstatUnix(List<String> lines, int port) {
        List<PortProcessEntry> out = new ArrayList<>();
        String portSuffix = ":" + port;
        for (String line : lines) {
            String trimmed = line.trim();
            String[] cols = trimmed.split("\\s+");
            if (cols.length < 4) continue;
            String proto = cols[0].toLowerCase(Locale.ROOT);
            if (!proto.startsWith("tcp") && !proto.startsWith("udp")) continue;
            String local = cols[3];
            if (!local.endsWith(portSuffix)) continue;
            AddrPort lp = splitAddr(local);
            if (lp.port != port) continue;
            String foreign = cols.length > 4 ? cols[4] : null;
            String state = null;
            String pidName = null;
            if (proto.startsWith("tcp") && cols.length > 5) {
                state = cols[5];
                if (cols.length > 6) pidName = cols[6];
            } else if (proto.startsWith("udp") && cols.length > 5) {
                pidName = cols[5];
            }
            Long pid = null;
            String name = null;
            if (pidName != null && pidName.contains("/")) {
                String[] parts = pidName.split("/", 2);
                try { pid = Long.parseLong(parts[0]); } catch (NumberFormatException ignored) {}
                if (parts.length > 1) name = parts[1];
            }
            String family = proto.endsWith("6") ? "IPv6" : family(lp.host);
            out.add(new PortProcessEntry(proto.toUpperCase(Locale.ROOT), family, lp.host, lp.port,
                    foreign, state, pid, name, null));
        }
        return out;
    }

    // ---------------- helpers ----------------

    private record AddrPort(String host, int port) {}

    private static AddrPort splitAddr(String s) {
        int colon = s.lastIndexOf(':');
        if (colon < 0) return new AddrPort(s, -1);
        String host = s.substring(0, colon);
        String portStr = s.substring(colon + 1);
        int p = -1;
        try { p = Integer.parseInt(portStr); } catch (NumberFormatException ignored) {}
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        return new AddrPort(host, p);
    }

    private static String family(String host) {
        return host.contains(":") ? "IPv6" : "IPv4";
    }
}
