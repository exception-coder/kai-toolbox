package com.exceptioncoder.toolbox.foreconsult.backend;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Version 1 backend API. Every business operation authenticates its independent application token. */
@RestController
@RequestMapping("/api/fore-consult/v1")
public class ConsultBackendController {
    private final ConsultBackendAuth auth;
    private final ConsultAnalysisService analysis;
    private final ConsultAnalysisImages images;

    public ConsultBackendController(ConsultBackendAuth auth, ConsultAnalysisService analysis, ConsultAnalysisImages images) {
        this.auth = auth; this.analysis = analysis; this.images = images;
    }

    @PostMapping("/attachments")
    public ResponseEntity<ConsultImageStore.Image> upload(HttpServletRequest request, @RequestParam String uploadId) throws IOException {
        var client = auth.authenticate(request.getHeader("Authorization"));
        byte[] bytes = request.getInputStream().readNBytes(ConsultAnalysisImages.MAX_BYTES + 1);
        var image = images.upload(client, uploadId, request.getContentType(), bytes);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Location", "/api/fore-consult/v1/attachments/" + image.attachmentId()).body(image);
    }

    @GetMapping("/attachments/{id}")
    public ResponseEntity<ConsultImageStore.Image> image(HttpServletRequest request, @PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(images.get(auth.authenticate(request.getHeader("Authorization")), id, false));
    }

    @GetMapping("/attachments")
    public ResponseEntity<ConsultImageStore.Image> findImage(HttpServletRequest request, @RequestParam String uploadId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(images.get(auth.authenticate(request.getHeader("Authorization")), uploadId, true));
    }

    @PostMapping(value = "/token", consumes = "application/x-www-form-urlencoded")
    public ResponseEntity<ConsultBackendAuth.AccessToken> token(@RequestHeader(value = "Authorization", required = false) String basic,
            @RequestParam("grant_type") String grantType) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.token(basic, grantType));
    }

    @PostMapping(value = "/analysis-tasks", consumes = "application/json")
    public ResponseEntity<ConsultAnalysisService.TaskView> submit(HttpServletRequest request) throws IOException {
        var client = auth.authenticate(request.getHeader("Authorization"));
        String raw = read(request);
        var task = analysis.submit(client, raw);
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .header("Location", "/api/fore-consult/v1/analysis-tasks/" + task.taskId()).header("Retry-After", "2").body(task);
    }

    @GetMapping("/analysis-tasks/{id}")
    public ResponseEntity<ConsultAnalysisService.TaskView> get(HttpServletRequest request, @PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(analysis.get(auth.authenticate(request.getHeader("Authorization")), id));
    }

    @GetMapping("/analysis-tasks")
    public ResponseEntity<ConsultAnalysisService.TaskView> find(HttpServletRequest request, @RequestParam String requestId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(analysis.findRequest(auth.authenticate(request.getHeader("Authorization")), requestId));
    }

    @PostMapping("/analysis-tasks/{id}/cancel")
    public ResponseEntity<ConsultAnalysisService.TaskView> cancel(HttpServletRequest request, @PathVariable String id) {
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(analysis.cancel(auth.authenticate(request.getHeader("Authorization")), id));
    }

    static String read(HttpServletRequest request) throws IOException {
        byte[] bytes = request.getInputStream().readNBytes(196609);
        if (bytes.length > 196608) throw new ConsultBackendException(413, "PAYLOAD_TOO_LARGE", "请求不得超过 192KiB", false);
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
