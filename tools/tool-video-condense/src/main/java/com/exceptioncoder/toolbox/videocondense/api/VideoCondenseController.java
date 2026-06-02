package com.exceptioncoder.toolbox.videocondense.api;

import com.exceptioncoder.toolbox.videocondense.api.dto.AnalyzeRequest;
import com.exceptioncoder.toolbox.videocondense.api.dto.JobView;
import com.exceptioncoder.toolbox.videocondense.api.dto.RenderRequest;
import com.exceptioncoder.toolbox.videocondense.service.CondenseJobService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * 视频智能变速端点。analyze 起异步分析，render 用（可微调）曲线渲染，events 推 SSE 进度，
 * artifact 支持 Range 回放产物。失败语义交全局异常处理：参数错→400、找不到→404、FFmpeg 不可用→503。
 */
@RestController
@RequestMapping("/api/video-condense")
public class VideoCondenseController {

    private final CondenseJobService service;

    public VideoCondenseController(CondenseJobService service) {
        this.service = service;
    }

    @PostMapping("/analyze")
    public Map<String, String> analyze(@RequestBody AnalyzeRequest req) {
        return Map.of("jobId", service.analyze(req.path()));
    }

    @GetMapping("/jobs/{id}")
    public JobView getJob(@PathVariable String id) throws IOException {
        return service.getJob(id);
    }

    @GetMapping("/jobs/{id}/events")
    public SseEmitter events(@PathVariable String id) throws IOException {
        return service.events(id);
    }

    @PostMapping("/render")
    public JobView render(@RequestBody RenderRequest req) throws IOException {
        return service.render(req.jobId(), req.segments(), req.musicPath());
    }

    @PostMapping("/jobs/{id}/cancel")
    public JobView cancel(@PathVariable String id) throws IOException {
        return service.cancel(id);
    }

    @GetMapping("/jobs")
    public List<JobView> recent(@RequestParam(required = false, defaultValue = "20") int limit) {
        return service.recent(limit);
    }

    /** 托管浓缩产物 out.mp4，支持 Range（{@code <video>} 拖动）。 */
    @GetMapping("/jobs/{id}/artifact")
    public ResponseEntity<ResourceRegion> artifact(@PathVariable String id,
                                                   @RequestHeader HttpHeaders headers) throws IOException {
        Path file = service.resolveArtifact(id);
        long length = Files.size(file);
        Resource resource = new FileSystemResource(file);
        MediaType mime = MediaType.parseMediaType("video/mp4");
        List<HttpRange> ranges = headers.getRange();
        if (ranges.isEmpty()) {
            return ResponseEntity.ok()
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .contentType(mime)
                    .body(new ResourceRegion(resource, 0, length));
        }
        ResourceRegion region = ranges.get(0).toResourceRegion(resource);
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentType(mime)
                .body(region);
    }
}
