package com.exceptioncoder.toolbox.videocondense.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.video-condense.*}。ffmpeg/ffprobe 路径沿用 {@code toolbox.ffmpeg.*}
 * （toolbox-common 的 {@code FfmpegProperties}），本配置只管浓缩器自身的运行参数与评分阈值。
 */
@ConfigurationProperties(prefix = "toolbox.video-condense")
public class VideoCondenseProperties {

    /** 作业工作目录；每个 jobId 一个子目录存产物。默认 {@code ${user.home}/.kai-toolbox/video-condense}。 */
    private String workDir = System.getProperty("user.home") + "/.kai-toolbox/video-condense";

    /** workDir 子目录保留分钟数，超期在下次作业前清理（产物不持久化）。 */
    private int retainMinutes = 120;

    /** 分析阶段 ffmpeg 硬超时（秒）。 */
    private int analyzeTimeoutSeconds = 600;

    /** 渲染阶段 ffmpeg 硬超时（秒）。 */
    private int renderTimeoutSeconds = 1800;

    /** 分析抽帧帧率：每秒取样数，越低越快、分辨率越粗。 */
    private int sampleFps = 4;

    /** 分析降采样分辨率（scale 滤镜参数），低分辨率足够算 scene 变化。 */
    private String sampleScale = "160:90";

    /** 评分窗口（秒）：把逐帧分数归并到该粒度的窗口。 */
    private double windowSeconds = 1.0;

    /** 合并后每段最小时长（秒），防变速抖动。 */
    private double minSegmentSeconds = 0.8;

    /** 相邻段速度差超过该比例时，边界做 ramp 平滑过渡。 */
    private double rampSpeedDeltaThreshold = 2.0;

    /** ramp 过渡时长（秒）。 */
    private double rampSeconds = 0.4;

    /** 渲染段数上限，超过则切到 -filter_complex_script 文件模式。 */
    private int maxSegments = 200;

    // ── score → speed 分档（阈值降序）──
    private double normalThreshold = 0.7;   // ≥ → 原速
    private double midThreshold = 0.4;      // ≥ → 中速
    private double lowThreshold = 0.2;      // ≥ → 高速；< → 极速

    private double speedNormal = 1.0;
    private double speedMid = 1.5;
    private double speedLow = 3.0;
    private double speedHigh = 6.0;
    /** FREEZE（静止）段倍速。 */
    private double speedFreeze = 8.0;

    public String getWorkDir() { return workDir; }
    public void setWorkDir(String workDir) { this.workDir = workDir; }

    public int getRetainMinutes() { return retainMinutes; }
    public void setRetainMinutes(int retainMinutes) { this.retainMinutes = retainMinutes; }

    public int getAnalyzeTimeoutSeconds() { return analyzeTimeoutSeconds; }
    public void setAnalyzeTimeoutSeconds(int analyzeTimeoutSeconds) { this.analyzeTimeoutSeconds = analyzeTimeoutSeconds; }

    public int getRenderTimeoutSeconds() { return renderTimeoutSeconds; }
    public void setRenderTimeoutSeconds(int renderTimeoutSeconds) { this.renderTimeoutSeconds = renderTimeoutSeconds; }

    public int getSampleFps() { return sampleFps; }
    public void setSampleFps(int sampleFps) { this.sampleFps = sampleFps; }

    public String getSampleScale() { return sampleScale; }
    public void setSampleScale(String sampleScale) { this.sampleScale = sampleScale; }

    public double getWindowSeconds() { return windowSeconds; }
    public void setWindowSeconds(double windowSeconds) { this.windowSeconds = windowSeconds; }

    public double getMinSegmentSeconds() { return minSegmentSeconds; }
    public void setMinSegmentSeconds(double minSegmentSeconds) { this.minSegmentSeconds = minSegmentSeconds; }

    public double getRampSpeedDeltaThreshold() { return rampSpeedDeltaThreshold; }
    public void setRampSpeedDeltaThreshold(double rampSpeedDeltaThreshold) { this.rampSpeedDeltaThreshold = rampSpeedDeltaThreshold; }

    public double getRampSeconds() { return rampSeconds; }
    public void setRampSeconds(double rampSeconds) { this.rampSeconds = rampSeconds; }

    public int getMaxSegments() { return maxSegments; }
    public void setMaxSegments(int maxSegments) { this.maxSegments = maxSegments; }

    public double getNormalThreshold() { return normalThreshold; }
    public void setNormalThreshold(double normalThreshold) { this.normalThreshold = normalThreshold; }

    public double getMidThreshold() { return midThreshold; }
    public void setMidThreshold(double midThreshold) { this.midThreshold = midThreshold; }

    public double getLowThreshold() { return lowThreshold; }
    public void setLowThreshold(double lowThreshold) { this.lowThreshold = lowThreshold; }

    public double getSpeedNormal() { return speedNormal; }
    public void setSpeedNormal(double speedNormal) { this.speedNormal = speedNormal; }

    public double getSpeedMid() { return speedMid; }
    public void setSpeedMid(double speedMid) { this.speedMid = speedMid; }

    public double getSpeedLow() { return speedLow; }
    public void setSpeedLow(double speedLow) { this.speedLow = speedLow; }

    public double getSpeedHigh() { return speedHigh; }
    public void setSpeedHigh(double speedHigh) { this.speedHigh = speedHigh; }

    public double getSpeedFreeze() { return speedFreeze; }
    public void setSpeedFreeze(double speedFreeze) { this.speedFreeze = speedFreeze; }
}
