package com.exceptioncoder.toolbox.quicklaunch.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.stream.Collectors;

/** 为已存在的快捷入口 SQLite 表补充增量字段。 */
@Component("quickLaunchSchemaMigration")
public class QuickLaunchSchemaMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public QuickLaunchSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 应用启动后幂等补充站点窗口行为字段。 */
    @Override
    public void run(ApplicationArguments arguments) {
        Set<String> columns = jdbc.queryForList("PRAGMA table_info(quick_launch_site)").stream()
                .map(row -> String.valueOf(row.get("name")))
                .collect(Collectors.toSet());
        if (!columns.contains("window_behavior")) {
            jdbc.execute("ALTER TABLE quick_launch_site ADD COLUMN window_behavior TEXT NOT NULL DEFAULT 'STANDARD'");
        }
    }
}
