package com.exceptioncoder.toolbox.system;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 绑定 {@code toolbox.system.*}：系统级运维配置。 */
@ConfigurationProperties(prefix = "toolbox.system")
public class SystemProperties {

    /** 远程重启端点 token；空字符串 = 端点关闭（公网 tunnel 下默认不开放）。 */
    private String restartToken = "";

    /** 启动时若守护进程未运行则自举拉起（仅 Windows + dev：脚本存在、且非守护脚本起的实例）。 */
    private boolean supervisorBootstrap = true;

    /** 守护进程 HTTP 控制口端口，用于探测其是否已在运行。 */
    private int supervisorPort = 18081;

    /** 守护脚本路径（相对运行目录或绝对）。 */
    private String supervisorScript = "scripts/run-supervised.ps1";

    /** 拉起守护脚本用的 PowerShell 可执行（pwsh 7 优先）。 */
    private String pwshBin = "pwsh";

    public String getRestartToken() {
        return restartToken;
    }

    public void setRestartToken(String restartToken) {
        this.restartToken = restartToken == null ? "" : restartToken;
    }

    public boolean isSupervisorBootstrap() {
        return supervisorBootstrap;
    }

    public void setSupervisorBootstrap(boolean supervisorBootstrap) {
        this.supervisorBootstrap = supervisorBootstrap;
    }

    public int getSupervisorPort() {
        return supervisorPort;
    }

    public void setSupervisorPort(int supervisorPort) {
        this.supervisorPort = supervisorPort;
    }

    public String getSupervisorScript() {
        return supervisorScript;
    }

    public void setSupervisorScript(String supervisorScript) {
        this.supervisorScript = supervisorScript;
    }

    public String getPwshBin() {
        return pwshBin;
    }

    public void setPwshBin(String pwshBin) {
        this.pwshBin = pwshBin;
    }
}
