package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.video.merge.*}。由顶层 ToolboxApplication 的 {@code @ConfigurationPropertiesScan}
 * 自动注册（与 {@link VideoExtensionsProperties} / {@link WhisperProperties} 同机制，无需手动
 * {@code @EnableConfigurationProperties}）。
 */
@ConfigurationProperties(prefix = "toolbox.video.merge")
public class VideoMergeProperties {
    /** 合并输出目录；留空 = {@code ${user.home}/.kai-toolbox/merged}。 */
    private String outputDir = "";
    /** 重编码目标分辨率，WxH。 */
    private String targetResolution = "1280x720";
    /** 重编码目标帧率。 */
    private int targetFps = 30;
    /** 单次最多合并的输入数。 */
    private int maxInputs = 100;
    /** ffmpeg 进程硬超时（秒）。 */
    private int timeoutS = 1800;

    public String getOutputDir() { return outputDir; }
    public void setOutputDir(String outputDir) { this.outputDir = outputDir; }

    public String getTargetResolution() { return targetResolution; }
    public void setTargetResolution(String targetResolution) { this.targetResolution = targetResolution; }

    public int getTargetFps() { return targetFps; }
    public void setTargetFps(int targetFps) { this.targetFps = targetFps; }

    public int getMaxInputs() { return maxInputs; }
    public void setMaxInputs(int maxInputs) { this.maxInputs = maxInputs; }

    public int getTimeoutS() { return timeoutS; }
    public void setTimeoutS(int timeoutS) { this.timeoutS = timeoutS; }
}
