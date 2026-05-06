package com.exceptioncoder.toolbox.common.media;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code toolbox.ffmpeg.*} from application.yml. Used by {@link FfmpegProbe}
 * for the startup version check and by every spawn of {@code ffmpeg / ffprobe}.
 */
@ConfigurationProperties(prefix = "toolbox.ffmpeg")
public class FfmpegProperties {
    private String binary = "ffmpeg";
    private String ffprobeBinary = "ffprobe";
    private long probeTimeoutMs = 5000;

    /**
     * Hardware acceleration for the HLS re-encode path. Empty string = software encode.
     * Accepted: {@code qsv} (Intel Quick Sync), {@code nvenc} (NVIDIA), {@code amf} (AMD),
     * {@code videotoolbox} (macOS), {@code auto} (let ffmpeg choose). Picking the wrong
     * value means ffmpeg will refuse to start; check the startup log if encoding fails.
     */
    private String hwaccel = "";

    public String getBinary() { return binary; }
    public void setBinary(String binary) { this.binary = binary; }

    public String getFfprobeBinary() { return ffprobeBinary; }
    public void setFfprobeBinary(String ffprobeBinary) { this.ffprobeBinary = ffprobeBinary; }

    public long getProbeTimeoutMs() { return probeTimeoutMs; }
    public void setProbeTimeoutMs(long probeTimeoutMs) { this.probeTimeoutMs = probeTimeoutMs; }

    public String getHwaccel() { return hwaccel; }
    public void setHwaccel(String hwaccel) { this.hwaccel = hwaccel == null ? "" : hwaccel.trim().toLowerCase(); }
}
