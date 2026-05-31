package com.exceptioncoder.toolbox.ffmpeglab.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.ffmpeg-lab.*}。ffmpeg / ffprobe 路径与硬件加速沿用 {@code toolbox.ffmpeg.*}
 * （由 toolbox-common 的 {@code FfmpegProperties} 承载），本配置只管实验台自身的运行参数。
 */
@ConfigurationProperties(prefix = "toolbox.ffmpeg-lab")
public class FfmpegLabProperties {

    /** 临时物料根目录；每个 runId 一个子目录。默认 {@code ${user.home}/.kai-toolbox/ffmpeg-lab}。 */
    private String workDir = System.getProperty("user.home") + "/.kai-toolbox/ffmpeg-lab";

    /** 默认只转前 N 秒做快速可行性试验；0 表示整片。 */
    private int defaultClipSeconds = 30;

    /** workDir 子目录保留分钟数，超期在下次运行前清理。 */
    private int retainMinutes = 30;

    /** ffmpeg stderr 末尾保留行数，用于失败定位。 */
    private int stderrTailLines = 40;

    public String getWorkDir() {
        return workDir;
    }

    public void setWorkDir(String workDir) {
        this.workDir = workDir;
    }

    public int getDefaultClipSeconds() {
        return defaultClipSeconds;
    }

    public void setDefaultClipSeconds(int defaultClipSeconds) {
        this.defaultClipSeconds = defaultClipSeconds;
    }

    public int getRetainMinutes() {
        return retainMinutes;
    }

    public void setRetainMinutes(int retainMinutes) {
        this.retainMinutes = retainMinutes;
    }

    public int getStderrTailLines() {
        return stderrTailLines;
    }

    public void setStderrTailLines(int stderrTailLines) {
        this.stderrTailLines = stderrTailLines;
    }
}
