package com.exceptioncoder.toolbox.ffmpeglab.domain;

/**
 * 实验台开放的「转码 / 封装输出到 web」模式。每种模式自带：
 * <ul>
 *   <li>{@code label} —— 前端展示名；</li>
 *   <li>{@code playKind} —— 浏览器侧的投递类型，决定前端用 {@code <video>} / hls.js / {@code <img>} 哪种播放壳；</li>
 *   <li>{@code streaming} —— true 表示边转边出（不落临时文件，直接 pipe 给 HTTP 响应）。</li>
 * </ul>
 *
 * <p>各模式对应的 ffmpeg 命令骨架集中在 {@code ModeCommandBuilder}，本枚举只承载元数据。
 */
public enum TranscodeMode {

    /** 只换容器不重编码（{@code -c copy}）；源编码非 mp4 兼容时会失败——正好用来演示「为什么 copy 不行」。 */
    REMUX_COPY("Remux 直封装", PlayKind.NATIVE, false),

    /** 重编码到 H.264/AAC 的 progressive MP4，浏览器原生播放的万能兜底。 */
    PROGRESSIVE_MP4("Progressive MP4 全转码", PlayKind.NATIVE, false),

    /** HLS + MPEG-TS 分段，hls.js 播放（传统流式标杆）。 */
    HLS_TS("HLS (MPEG-TS)", PlayKind.HLS, false),

    /** HLS + 碎片化 MP4（fMP4 / CMAF）分段，hls.js 播放（现代封装）。 */
    HLS_FMP4("HLS (fMP4/CMAF)", PlayKind.HLS, false),

    /** Motion JPEG 帧流，{@code <img>} multipart 直出；无音频，怪格式「至少看到画面」的终极兜底。 */
    MJPEG("MJPEG 帧流", PlayKind.MJPEG, true);

    /** 浏览器侧投递类型，前端按此选择播放壳。 */
    public enum PlayKind {
        /** {@code <video src>} 原生播放（progressive / remux 产物）。 */
        NATIVE,
        /** hls.js 加载 m3u8。 */
        HLS,
        /** {@code <img src>} 接 multipart/x-mixed-replace。 */
        MJPEG
    }

    private final String label;
    private final PlayKind playKind;
    private final boolean streaming;

    TranscodeMode(String label, PlayKind playKind, boolean streaming) {
        this.label = label;
        this.playKind = playKind;
        this.streaming = streaming;
    }

    public String label() {
        return label;
    }

    public PlayKind playKind() {
        return playKind;
    }

    public boolean streaming() {
        return streaming;
    }
}
