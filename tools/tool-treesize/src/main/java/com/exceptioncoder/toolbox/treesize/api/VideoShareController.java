package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.common.media.ThumbnailService;
import com.exceptioncoder.toolbox.treesize.domain.VideoShare;
import com.exceptioncoder.toolbox.treesize.service.HlsService;
import com.exceptioncoder.toolbox.treesize.service.PathAccessGuard;
import com.exceptioncoder.toolbox.treesize.service.RawStreamService;
import com.exceptioncoder.toolbox.treesize.service.VideoShareService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.file.Path;

/**
 * 公开的视频分享端点：凭 token 匿名播放单个视频。
 *
 * <p><b>刻意不放在 {@link TreeSizeController} 里</b> —— 那个类上有
 * {@code @RequireRole({"ADMIN","VIDEO_LIBRARY","DISK_ADMIN"})}，注解按「方法→类」继承且没有
 * 反向豁免注解，任何加进去的方法都会被连坐要求登录。分享链接必须匿名可达，只能独立成类。
 *
 * <p>授权边界靠三件事守住，而不是靠「路径没被拦」这种默认放行：
 * <ol>
 *   <li>token 是 32 字节随机、单视频、可撤销、默认 7 天过期（见 {@link VideoShareService}）；</li>
 *   <li>播放的 scanId/path <b>只从分享记录里取</b>，绝不接受请求参数 —— 否则拿到任一 token 就能
 *       改 path 读任意文件；</li>
 *   <li>取到路径后仍走 {@link PathAccessGuard}，保留软链接解析与越界校验，不因匿名而放松沙箱。</li>
 * </ol>
 *
 * <p>不存在 / 已撤销 / 已过期一律 404，不区分，免得把 token 是否存在这种信息透给探测者。
 */
@RestController
@RequestMapping("/api/share")
public class VideoShareController {

    private final VideoShareService shares;
    private final PathAccessGuard guard;
    private final RawStreamService raw;
    private final ThumbnailService thumbnails;
    private final FfmpegProbe ffmpeg;
    private final HlsService hls;

    public VideoShareController(VideoShareService shares, PathAccessGuard guard,
                                RawStreamService raw, ThumbnailService thumbnails,
                                FfmpegProbe ffmpeg, HlsService hls) {
        this.shares = shares;
        this.guard = guard;
        this.raw = raw;
        this.thumbnails = thumbnails;
        this.ffmpeg = ffmpeg;
        this.hls = hls;
    }

    /**
     * 分享落地页要展示的元信息。故意不回真实磁盘路径 —— 收链接的人没有必要知道。
     *
     * <p>{@code playable} 告诉前端该用哪条播放路径，避免它自己按扩展名猜：
     * {@code native} = 浏览器能直接播原文件；{@code hls} = 需要实时转码；
     * {@code none} = 需要转码但 FFmpeg 不可用，此时页面直接说明而不是卡在黑屏。
     */
    public record SharedVideoView(String name, long size, long expiresAt, String playable) {}

    @GetMapping("/{token}")
    public ResponseEntity<SharedVideoView> meta(@PathVariable String token) {
        VideoShare share = shares.resolve(token).orElse(null);
        if (share == null) return ResponseEntity.notFound().build();
        Path file = resolveOrNull(share);
        if (file == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(new SharedVideoView(
                share.name(), share.size(), share.expiresAt(), playbackMode(file)));
    }

    /**
     * 判定播放方式。与工作台内 {@code /probe} 的口径一致（同一个
     * {@link FfmpegProbe#nativelyPlayable}），免得同一个文件在工作台能播、分享页却黑屏。
     *
     * <p>探测失败按需要转码处理：宁可多转一次，也不要甩给浏览器一个它啃不动的 avi。
     */
    private String playbackMode(Path file) {
        boolean nativelyPlayable;
        try {
            ProbeResult info = ffmpeg.probe(file);
            nativelyPlayable = ffmpeg.nativelyPlayable(info);
        } catch (Exception e) {
            nativelyPlayable = false;
        }
        if (nativelyPlayable) return "native";
        return ffmpeg.isFfmpegAvailable() ? "hls" : "none";
    }

    /**
     * 裸流播放：浏览器能直接解的容器/编码走这条，支持 Range/206，可拖进度条。
     * 不能直接解的（avi / mkv / HEVC 等）由前端按 {@code playable} 改走下面的 HLS。
     */
    @GetMapping("/{token}/raw")
    public ResponseEntity<ResourceRegion> stream(@PathVariable String token,
                                                 @RequestHeader HttpHeaders headers) throws IOException {
        VideoShare share = shares.resolve(token).orElse(null);
        if (share == null) return ResponseEntity.notFound().build();
        Path file = resolveOrNull(share);
        if (file == null) return ResponseEntity.notFound().build();
        shares.touch(share.token());
        return raw.serve(file, headers);
    }

    /**
     * HLS 播放列表：给浏览器啃不动的容器/编码用（avi / mkv / HEVC…）。
     *
     * <p>凭证怎么跟着分片走：playlist 里的分片是<b>相对地址</b>，浏览器会按 playlist 自身的 URL
     * 解析，而本端点的 token 在<b>路径</b>里（{@code /api/share/{token}/hls/…}），所以
     * {@code segment-3.ts} 自然解析成 {@code /api/share/{token}/hls/segment-3.ts} —— 分片天然带
     * 凭证，不需要像工作台内那样靠 hls.js 手动注 Authorization 头。这也是工作台那套
     * 直接拿来分享会每片 401 的原因。
     *
     * <p>同时剥掉 {@code ?path=} 查询串：{@link HlsService} 为工作台生成的分片地址带着 URL 编码的
     * <b>完整磁盘路径</b>，那会把 D:\… 暴露给收链接的人（meta 里特意不回路径，这里漏出去就白设计了）。
     * 剥掉后本类的 segment 端点也压根不读它 —— 路径只认 token 记录里的那份。
     */
    @GetMapping(value = "/{token}/hls/playlist.m3u8", produces = "application/vnd.apple.mpegurl")
    public ResponseEntity<String> hlsPlaylist(@PathVariable String token) throws IOException {
        VideoShare share = shares.resolve(token).orElse(null);
        if (share == null) return ResponseEntity.notFound().build();
        Path file = resolveOrNull(share);
        if (file == null) return ResponseEntity.notFound().build();
        shares.touch(share.token());
        String body = stripPathParam(hls.playlist(share.scanId(), file));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.apple.mpegurl"))
                .body(body);
    }

    /**
     * HLS 分片。<b>不接受任何路径参数</b> —— 要转码哪个文件只由 token 记录决定，
     * 这样即便有人把 playlist 里的地址改成别的 path 也读不到额外文件。
     */
    @GetMapping(value = "/{token}/hls/segment-{idx}.ts", produces = "video/mp2t")
    public ResponseEntity<StreamingResponseBody> hlsSegment(@PathVariable String token,
                                                            @PathVariable int idx) {
        VideoShare share = shares.resolve(token).orElse(null);
        if (share == null) return ResponseEntity.notFound().build();
        Path file = resolveOrNull(share);
        if (file == null) return ResponseEntity.notFound().build();
        StreamingResponseBody body = out -> hls.writeSegment(file, idx, out);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp2t"))
                .body(body);
    }

    /** 去掉分片行尾部的 {@code ?path=…} 查询串，只留 {@code segment-N.ts}。 */
    private static String stripPathParam(String playlist) {
        return PLAYLIST_PATH_PARAM.matcher(playlist).replaceAll("$1");
    }

    private static final java.util.regex.Pattern PLAYLIST_PATH_PARAM =
            java.util.regex.Pattern.compile("(?m)^(segment-\\d+\\.ts)\\?[^\\r\\n]*$");

    /** 封面图，给落地页当 poster 用。生成失败就 404，不影响播放。 */
    @GetMapping(value = "/{token}/thumb", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<Resource> thumb(@PathVariable String token) {
        VideoShare share = shares.resolve(token).orElse(null);
        if (share == null) return ResponseEntity.notFound().build();
        Path file = resolveOrNull(share);
        if (file == null) return ResponseEntity.notFound().build();
        try {
            Path jpeg = thumbnails.getOrGenerate(file);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_JPEG)
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                    .body(new FileSystemResource(jpeg));
        } catch (IOException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 把分享记录还原成磁盘路径。文件已被删除 / 扫描记录已清 / 越界，一律当作分享失效返回 null，
     * 由调用方转 404 —— 匿名端点不该把异常细节（路径、栈）暴露出去。
     */
    private Path resolveOrNull(VideoShare share) {
        try {
            return guard.resolve(share.scanId(), share.path());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }
}
