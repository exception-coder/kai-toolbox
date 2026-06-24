package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.WelfareDemoProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

/**
 * 一次性副本沙箱供给：每个演示会话克隆 welfare-sign 源码到独立目录、把真实 {@code welfare_sign_*} 表
 * 数据导入独立 SQLite 库。运行期 agent 只读写副本，真实模块与 toolbox.db 全程零写入。会话结束 / 超 TTL 即销毁。
 */
@Slf4j
@Service
public class WelfareDemoSandboxProvisioner {

    private static final Pattern CREATE_TABLE =
            Pattern.compile("(?i)CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-zA-Z_][\\w]*)");

    private final WelfareDemoProperties props;
    private final JdbcTemplate jdbc;
    private final Path sandboxRoot;

    private final ConcurrentHashMap<String, Sandbox> active = new ConcurrentHashMap<>();

    public WelfareDemoSandboxProvisioner(WelfareDemoProperties props,
                                         JdbcTemplate jdbc,
                                         @Value("${toolbox.data-dir}") String dataDir) {
        this.props = props;
        this.jdbc = jdbc;
        this.sandboxRoot = Path.of(dataDir, "welfare-demo").toAbsolutePath().normalize();
    }

    /** 一次性副本句柄。 */
    public record Sandbox(String sandboxId, Path dir, Path demoDbPath, long createdAt) {
    }

    /**
     * 为会话供给副本：复制源码 + 建 demo 库导数据。容量超限抛 503。
     */
    /** 启动清残留：上次进程留下的副本目录/库全是孤儿，进程起来时无活跃会话，直接清空。 */
    @PostConstruct
    void cleanResidual() {
        deleteRecursively(sandboxRoot);
    }

    public Sandbox provision(String sessionId) {
        sweepExpired();
        if (active.size() >= props.getMaxConcurrentSandboxes()) {
            throw new ResponseStatusException(SERVICE_UNAVAILABLE, "演示繁忙，稍后再试");
        }
        Path repoRoot = resolveRepoRoot();
        String sandboxId = sessionId + "-" + UUID.randomUUID().toString().substring(0, 8);
        Path dir = sandboxRoot.resolve(sandboxId).normalize();
        Path demoDb = sandboxRoot.resolve(sandboxId + ".db").normalize();
        try {
            Files.createDirectories(dir);
            for (String rel : props.getSourcePaths()) {
                Path src = repoRoot.resolve(rel).normalize();
                if (Files.isDirectory(src)) {
                    copyTree(src, dir.resolve(rel));
                } else {
                    log.warn("[welfare-demo] 源码路径不存在，跳过: {}", src);
                }
            }
            seedDemoDb(demoDb);
        } catch (RuntimeException e) {
            disposePaths(dir, demoDb);
            throw e;
        }
        Sandbox sb = new Sandbox(sandboxId, dir, demoDb, System.currentTimeMillis());
        active.put(sessionId, sb);
        log.info("[welfare-demo] 供给副本 session={} dir={} db={}", sessionId, dir, demoDb);
        return sb;
    }

    /** 取本会话的 demo 库路径（SQL 工具据此连接，绝不接受外部传库路径）。 */
    public Path demoDbFor(String sessionId) {
        Sandbox sb = active.get(sessionId);
        return sb == null ? null : sb.demoDbPath();
    }

    /** 销毁一个会话的副本（幂等）。 */
    public void dispose(String sessionId) {
        Sandbox sb = active.remove(sessionId);
        if (sb != null) {
            disposePaths(sb.dir(), sb.demoDbPath());
            log.info("[welfare-demo] 已销毁副本 session={}", sessionId);
        }
    }

    /** 回收超 TTL 的副本。由 provision 顺带触发（无独立调度线程）。 */
    public void sweepExpired() {
        long ttlMs = props.getTtlMinutes() * 60_000L;
        long now = System.currentTimeMillis();
        active.forEach((sessionId, sb) -> {
            if (now - sb.createdAt() > ttlMs) {
                dispose(sessionId);
            }
        });
    }

    // ---- 内部 ----

    private void seedDemoDb(Path demoDb) {
        String schema = readSchema();
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + demoDb)) {
            // 1) 建表（执行 welfare-sign-schema.sql 的每条语句）
            for (String stmt : schema.split(";")) {
                String s = stmt.trim();
                if (s.isEmpty()) continue;
                try (Statement st = conn.createStatement()) {
                    st.execute(s);
                }
            }
            // 2) 从真实表导入数据（只读真实库）
            Matcher m = CREATE_TABLE.matcher(schema);
            while (m.find()) {
                copyTableData(conn, m.group(1));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("建 demo 库失败: " + e.getMessage(), e);
        }
    }

    private void copyTableData(Connection demo, String table) throws SQLException {
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT * FROM " + table);
        } catch (RuntimeException e) {
            log.debug("[welfare-demo] 真实表 {} 读取跳过: {}", table, e.getMessage());
            return;
        }
        if (rows.isEmpty()) return;
        List<String> cols = List.copyOf(rows.get(0).keySet());
        String placeholders = String.join(",", cols.stream().map(c -> "?").toList());
        String sql = "INSERT INTO " + table + " (" + String.join(",", cols) + ") VALUES (" + placeholders + ")";
        try (PreparedStatement ps = demo.prepareStatement(sql)) {
            for (Map<String, Object> row : rows) {
                int i = 1;
                for (String c : cols) {
                    ps.setObject(i++, row.get(c));
                }
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private String readSchema() {
        try {
            return new String(new ClassPathResource("db/welfare-sign-schema.sql")
                    .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("读取 welfare-sign-schema.sql 失败", e);
        }
    }

    private void copyTree(Path src, Path dst) {
        try {
            Files.walkFileTree(src, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path d, BasicFileAttributes a) throws IOException {
                    if (props.getCopyExcludes().contains(d.getFileName().toString())) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    Files.createDirectories(dst.resolve(src.relativize(d)));
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path f, BasicFileAttributes a) throws IOException {
                    Files.copy(f, dst.resolve(src.relativize(f)));
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException("复制源码副本失败: " + src, e);
        }
    }

    private static void disposePaths(Path dir, Path demoDb) {
        deleteRecursively(dir);
        try {
            Files.deleteIfExists(demoDb);
        } catch (IOException e) {
            // 忽略：TTL 下次再扫
        }
    }

    private static void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // 单文件删失败不阻断
                }
            });
        } catch (IOException ignored) {
            // 整体删失败，留给下次 TTL
        }
    }

    /** 从工作目录逐级向上找含 welfare-sign 源码的仓库根（dev 从源码跑时才有意义）。 */
    private Path resolveRepoRoot() {
        Path cur = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        for (int i = 0; i < 6 && cur != null; i++) {
            if (Files.isDirectory(cur.resolve("tools/tool-welfare-sign"))) {
                return cur;
            }
            cur = cur.getParent();
        }
        throw new ResponseStatusException(SERVICE_UNAVAILABLE,
                "未找到 welfare-sign 源码（演示需从源码目录运行）");
    }
}
