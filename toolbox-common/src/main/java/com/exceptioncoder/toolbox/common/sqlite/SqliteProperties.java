package com.exceptioncoder.toolbox.common.sqlite;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "toolbox.sqlite")
public class SqliteProperties {

    /**
     * SQLite 数据库文件绝对路径。
     */
    private String file;

    private int busyTimeoutMs = 5000;

    private String journalMode = "WAL";

    public String getFile() { return file; }
    public void setFile(String file) { this.file = file; }

    public int getBusyTimeoutMs() { return busyTimeoutMs; }
    public void setBusyTimeoutMs(int busyTimeoutMs) { this.busyTimeoutMs = busyTimeoutMs; }

    public String getJournalMode() { return journalMode; }
    public void setJournalMode(String journalMode) { this.journalMode = journalMode; }
}
