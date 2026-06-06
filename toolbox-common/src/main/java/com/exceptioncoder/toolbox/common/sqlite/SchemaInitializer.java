package com.exceptioncoder.toolbox.common.sqlite;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 启动时执行所有 {@code classpath*:db/*-schema.sql}。
 * 每个工具模块把自己的建表语句放在 {@code resources/db/<tool>-schema.sql} 即可被自动加载。
 * 所有语句必须使用 {@code CREATE TABLE IF NOT EXISTS} / {@code CREATE INDEX IF NOT EXISTS} 实现幂等。
 */
@Component
public class SchemaInitializer {

    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);

    private final JdbcTemplate jdbc;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public SchemaInitializer(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void init() throws IOException {
        Resource[] resources = resolver.getResources("classpath*:db/*-schema.sql");
        for (Resource res : resources) {
            String sql = StreamUtils.copyToString(res.getInputStream(), StandardCharsets.UTF_8);
            log.info("Applying schema: {}", res.getFilename());
            for (String stmt : splitStatements(sql)) {
                // 剥掉注释后无实际语句的段直接跳过：文件末尾的纯注释会被 split 切成空语句，
                // SQLite 执行空语句会在 finalize 时抛 "prepared statement has been finalized"
                if (isEffectivelyEmpty(stmt)) continue;
                try {
                    jdbc.execute(stmt);
                } catch (Exception e) {
                    // SQLite 的 ALTER TABLE ADD COLUMN 没有原生 IF NOT EXISTS；
                    // 列已存在时会抛 "duplicate column" —— 这是幂等迁移的预期，降级为 debug
                    if (isLikelyIdempotent(e)) {
                        log.debug("schema 语句已应用过，跳过: {}", trim(e.getMessage()));
                    } else {
                        throw new RuntimeException("schema 执行失败: " + stmt.trim(), e);
                    }
                }
            }
        }
    }

    private static boolean isLikelyIdempotent(Exception e) {
        String msg = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
        return msg.contains("duplicate column") || msg.contains("already exists");
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > 200 ? s.substring(0, 200) + "…" : s;
    }

    private static boolean isEffectivelyEmpty(String stmt) {
        String stripped = stmt
                .replaceAll("(?s)/\\*.*?\\*/", "")
                .replaceAll("(?m)--.*$", "")
                .trim();
        return stripped.isEmpty();
    }

    private String[] splitStatements(String sql) {
        // SQLite 的简单 split 即可：按 ; 分号切分；本工程不写存储过程
        return sql.split(";");
    }
}
