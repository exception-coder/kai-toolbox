package com.exceptioncoder.toolbox.common.sqlite;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import javax.sql.DataSource;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
@EnableConfigurationProperties(SqliteProperties.class)
public class SqliteConfig {

    private static final Logger log = LoggerFactory.getLogger(SqliteConfig.class);

    private final SqliteProperties props;

    public SqliteConfig(SqliteProperties props) {
        this.props = props;
    }

    @PostConstruct
    public void ensureDirectory() throws Exception {
        Path dbFile = Paths.get(props.getFile());
        Path parent = dbFile.getParent();
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent);
            log.info("Created data dir: {}", parent);
        }
    }

    @Bean
    public DataSource dataSource() {
        SQLiteConfig cfg = new SQLiteConfig();
        cfg.setJournalMode(SQLiteConfig.JournalMode.valueOf(props.getJournalMode()));
        cfg.setBusyTimeout(props.getBusyTimeoutMs());
        cfg.enforceForeignKeys(true);
        cfg.setSynchronous(SQLiteConfig.SynchronousMode.NORMAL);

        SQLiteDataSource ds = new SQLiteDataSource(cfg);
        ds.setUrl("jdbc:sqlite:" + new File(props.getFile()).getAbsolutePath());
        log.info("SQLite datasource at {}", props.getFile());
        return ds;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource ds) {
        return new JdbcTemplate(ds);
    }
}
