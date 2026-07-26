package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.media.ThumbnailService;
import com.exceptioncoder.toolbox.treesize.domain.VideoShare;
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

    public VideoShareController(VideoShareService shares, PathAccessGuard guard,
                                RawStreamService raw, ThumbnailService thumbnails) {
        this.shares = shares;
        this.guard = guard;
        this.raw = raw;
        this.thumbnails = thumbnails;
    }

    /** 分享落地页要展示的元信息。故意不回真实磁盘路径 —— 收链接的人没有必要知道。 */
    public record SharedVideoView(String name, long size, long expiresAt) {}

    @GetMapping("/{token}")
    public ResponseEntity<SharedVideoView> meta(@PathVariable String token) {
        return shares.resolve(token)
                .map(s -> ResponseEntity.ok(new SharedVideoView(s.name(), s.size(), s.expiresAt())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * 裸流播放。走 {@code RawStreamService}，天然支持 Range/206，
     * {@code <video src>} 可直接拖进度条 —— 微信内置浏览器也是这条路。
     *
     * <p>不提供 HLS：HLS 的 playlist 里 segment 是不带凭证的相对地址，靠 hls.js 手动注 header 才
     * 认证得了，匿名场景下每个分片都会 401；而且转码切片对分享没有意义。
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
