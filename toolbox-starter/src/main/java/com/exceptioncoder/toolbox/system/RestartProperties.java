package com.exceptioncoder.toolbox.system;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

/** JVM 外重启交接与 supervisor 控制协议配置。 */
@ConfigurationProperties(prefix = "toolbox.system.restart")
public class RestartProperties {

    /** Java 与 supervisor 的控制协议版本。 */
    private int supervisorProtocolVersion = 1;

    /** 连接本机 supervisor 控制口的超时。 */
    private Duration supervisorConnectTimeout = Duration.ofMillis(800);

    /** supervisor status/full-reload 请求的总超时。 */
    private Duration supervisorRequestTimeout = Duration.ofSeconds(4);

    /** 启动 replacement JVM 后等待其写入“接管等待”（非运行期健康）握手文件的时间。 */
    private Duration handoffReadyTimeout = Duration.ofSeconds(10);

    /** replacement JVM 最长等待旧 JVM 退出的时间。 */
    private Duration handoffParentTimeout = Duration.ofMinutes(2);

    /** HTTP 响应写回后，旧 JVM 再开始优雅关闭的短暂延迟。 */
    private Duration exitDelay = Duration.ofMillis(500);

    /** JVM 交接握手和独立日志目录。 */
    private Path handoffDir = Path.of(System.getProperty("user.home"), ".kai-toolbox", "restart-handoff");

    public int getSupervisorProtocolVersion() {
        return supervisorProtocolVersion;
    }

    public void setSupervisorProtocolVersion(int supervisorProtocolVersion) {
        this.supervisorProtocolVersion = supervisorProtocolVersion;
    }

    public Duration getSupervisorConnectTimeout() {
        return supervisorConnectTimeout;
    }

    public void setSupervisorConnectTimeout(Duration supervisorConnectTimeout) {
        this.supervisorConnectTimeout = positive(supervisorConnectTimeout, Duration.ofMillis(800));
    }

    public Duration getSupervisorRequestTimeout() {
        return supervisorRequestTimeout;
    }

    public void setSupervisorRequestTimeout(Duration supervisorRequestTimeout) {
        this.supervisorRequestTimeout = positive(supervisorRequestTimeout, Duration.ofSeconds(4));
    }

    public Duration getHandoffReadyTimeout() {
        return handoffReadyTimeout;
    }

    public void setHandoffReadyTimeout(Duration handoffReadyTimeout) {
        this.handoffReadyTimeout = positive(handoffReadyTimeout, Duration.ofSeconds(10));
    }

    public Duration getHandoffParentTimeout() {
        return handoffParentTimeout;
    }

    public void setHandoffParentTimeout(Duration handoffParentTimeout) {
        this.handoffParentTimeout = positive(handoffParentTimeout, Duration.ofMinutes(2));
    }

    public Duration getExitDelay() {
        return exitDelay;
    }

    public void setExitDelay(Duration exitDelay) {
        this.exitDelay = positive(exitDelay, Duration.ofMillis(500));
    }

    public Path getHandoffDir() {
        return handoffDir;
    }

    public void setHandoffDir(Path handoffDir) {
        if (handoffDir != null) {
            this.handoffDir = handoffDir;
        }
    }

    private static Duration positive(Duration value, Duration fallback) {
        return value == null || value.isZero() || value.isNegative() ? fallback : value;
    }
}
