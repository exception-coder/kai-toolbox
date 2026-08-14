package com.exceptioncoder.toolbox.system.update;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Java 内置自动更新配置。默认开启；不在 Git 工作区或不具备安全重启条件时只告警、不改代码。 */
@ConfigurationProperties(prefix = "toolbox.system.auto-update")
public class AutoUpdateProperties {

    private boolean enabled = true;
    private String repository = "";
    private String remote = "origin";
    private String branch = "main";
    private Duration initialDelay = Duration.ofSeconds(30);
    private Duration interval = Duration.ofSeconds(120);
    private Duration stableWindow = Duration.ofSeconds(120);
    private Duration commandTimeout = Duration.ofSeconds(10);
    private Duration fetchTimeout = Duration.ofSeconds(45);
    private Duration mergeTimeout = Duration.ofSeconds(60);
    private Duration buildTimeout = Duration.ofMinutes(20);
    private Duration cleanupTimeout = Duration.ofMinutes(5);
    private Duration drainTimeout = Duration.ofMinutes(10);
    private Duration maxBackoff = Duration.ofMinutes(15);
    private boolean requireIdle = true;
    private int maxOutputBytes = 65_536;
    private String gitCommand = "git";
    private String mavenCommand = "mvn";
    private String npmCommand = "npm";

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getRepository() { return repository; }
    public void setRepository(String repository) { this.repository = value(repository); }
    public String getRemote() { return remote; }
    public void setRemote(String remote) { this.remote = value(remote); }
    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = value(branch); }
    public Duration getInitialDelay() { return initialDelay; }
    public void setInitialDelay(Duration initialDelay) { this.initialDelay = duration(initialDelay, Duration.ofSeconds(30)); }
    public Duration getInterval() { return interval; }
    public void setInterval(Duration interval) { this.interval = duration(interval, Duration.ofSeconds(120)); }
    public Duration getStableWindow() { return stableWindow; }
    public void setStableWindow(Duration stableWindow) { this.stableWindow = duration(stableWindow, Duration.ofSeconds(120)); }
    public Duration getCommandTimeout() { return commandTimeout; }
    public void setCommandTimeout(Duration commandTimeout) { this.commandTimeout = duration(commandTimeout, Duration.ofSeconds(10)); }
    public Duration getFetchTimeout() { return fetchTimeout; }
    public void setFetchTimeout(Duration fetchTimeout) { this.fetchTimeout = duration(fetchTimeout, Duration.ofSeconds(45)); }
    public Duration getMergeTimeout() { return mergeTimeout; }
    public void setMergeTimeout(Duration mergeTimeout) { this.mergeTimeout = duration(mergeTimeout, Duration.ofSeconds(60)); }
    public Duration getBuildTimeout() { return buildTimeout; }
    public void setBuildTimeout(Duration buildTimeout) { this.buildTimeout = duration(buildTimeout, Duration.ofMinutes(20)); }
    public Duration getCleanupTimeout() { return cleanupTimeout; }
    public void setCleanupTimeout(Duration cleanupTimeout) { this.cleanupTimeout = duration(cleanupTimeout, Duration.ofMinutes(5)); }
    public Duration getDrainTimeout() { return drainTimeout; }
    public void setDrainTimeout(Duration drainTimeout) { this.drainTimeout = duration(drainTimeout, Duration.ofMinutes(10)); }
    public Duration getMaxBackoff() { return maxBackoff; }
    public void setMaxBackoff(Duration maxBackoff) { this.maxBackoff = duration(maxBackoff, Duration.ofMinutes(15)); }
    public boolean isRequireIdle() { return requireIdle; }
    public void setRequireIdle(boolean requireIdle) { this.requireIdle = requireIdle; }
    public int getMaxOutputBytes() { return maxOutputBytes; }
    public void setMaxOutputBytes(int maxOutputBytes) { this.maxOutputBytes = Math.max(4_096, Math.min(maxOutputBytes, 1_048_576)); }
    public String getGitCommand() { return gitCommand; }
    public void setGitCommand(String gitCommand) { this.gitCommand = value(gitCommand); }
    public String getMavenCommand() { return mavenCommand; }
    public void setMavenCommand(String mavenCommand) { this.mavenCommand = value(mavenCommand); }
    public String getNpmCommand() { return npmCommand; }
    public void setNpmCommand(String npmCommand) { this.npmCommand = value(npmCommand); }

    private static String value(String value) { return value == null ? "" : value.trim(); }
    private static Duration duration(Duration value, Duration fallback) {
        return value == null || value.isNegative() || value.isZero() ? fallback : value;
    }
}
