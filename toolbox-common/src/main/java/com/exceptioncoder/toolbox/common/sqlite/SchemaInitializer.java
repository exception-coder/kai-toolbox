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
                if (!stmt.isBlank()) {
                    jdbc.execute(stmt);
                }
            }
        }
    }

    private String[] splitStatements(String sql) {
        // SQLite 的简单 split 即可：按 ; 分号切分；本工程不写存储过程
        return sql.split(";");
    }
}
