package com.regentech_fashion.wyoooni.application.storage;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.Nonnull;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** 创建 H5 本地 SQLite 主数据源，并保证首次启动目录存在。 */
@Configuration(proxyBeanMethods = false)
@Profile("dev")
@EnableConfigurationProperties(LocalDataProperties.class)
public class LocalSqliteConfiguration {
    /** 创建只属于 Wyoooni H5 数据的主数据源。 */
    @Bean(destroyMethod = "close")
    DataSource dataSource(LocalDataProperties properties) throws IOException {
        properties.validate();
        Path databaseFile = Path.of(properties.getFile()).toAbsolutePath().normalize();
        Path parent = databaseFile.getParent();
        if (parent != null) { Files.createDirectories(parent); }

        SQLiteConfig config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.setSynchronous(SQLiteConfig.SynchronousMode.NORMAL);
        config.enforceForeignKeys(true);
        config.setBusyTimeout(10_000);
        HikariConfig pool = getHikariConfig(properties, config, databaseFile);
        return new HikariDataSource(pool);
    }

    @Nonnull
    private static HikariConfig getHikariConfig(LocalDataProperties properties, SQLiteConfig config, Path databaseFile) {
        SQLiteDataSource sqliteDataSource = new SQLiteDataSource(config);
        sqliteDataSource.setUrl("jdbc:sqlite:" + databaseFile);

        HikariConfig pool = new HikariConfig();
        pool.setPoolName("wyoooni-local-sqlite");
        pool.setDataSource(sqliteDataSource);
        pool.setMaximumPoolSize(properties.getMaximumPoolSize());
        pool.setMinimumIdle(properties.getMinimumIdle());
        pool.setConnectionTimeout(properties.getConnectionTimeout().toMillis());
        pool.setValidationTimeout(properties.getValidationTimeout().toMillis());
        pool.setMaxLifetime(0);
        return pool;
    }
}
