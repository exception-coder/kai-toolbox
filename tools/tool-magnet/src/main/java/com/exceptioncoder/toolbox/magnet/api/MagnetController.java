package com.exceptioncoder.toolbox.magnet.api;

import com.exceptioncoder.toolbox.magnet.api.dto.AddTorrentRequest;
import com.exceptioncoder.toolbox.magnet.api.dto.AddUriRequest;
import com.exceptioncoder.toolbox.magnet.api.dto.HealthResponse;
import com.exceptioncoder.toolbox.magnet.domain.MagnetTaskView;
import com.exceptioncoder.toolbox.magnet.service.MagnetTaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/magnet")
public class MagnetController {

    private final MagnetTaskService service;

    public MagnetController(MagnetTaskService service) {
        this.service = service;
    }

    /** 健康检查：daemon 不可用时返回 200 + available=false。 */
    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse(service.isAvailable(), service.lastUnavailableReason());
    }

    @PostMapping("/tasks")
    public ResponseEntity<Map<String, Object>> addUri(@RequestBody @Valid AddUriRequest req) {
        var res = service.addUri(req.uri(), req.savePath());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("gid", res.gid(), "resolvedByCache", res.resolvedByCache()));
    }

    @PostMapping("/tasks/torrent")
    public ResponseEntity<Map<String, String>> addTorrent(@RequestBody @Valid AddTorrentRequest req) {
        String gid = service.addTorrent(req.contentBase64(), req.savePath());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("gid", gid));
    }

    @GetMapping("/tasks")
    public List<MagnetTaskView> list(@RequestParam(defaultValue = "100") int limit) {
        return service.listAll(limit);
    }

    @GetMapping("/tasks/{gid}")
    public MagnetTaskView get(@PathVariable String gid) {
        return service.getStatus(gid);
    }

    @PostMapping("/tasks/{gid}/pause")
    public ResponseEntity<Void> pause(@PathVariable String gid) {
        service.pause(gid);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/tasks/{gid}/resume")
    public ResponseEntity<Void> resume(@PathVariable String gid) {
        service.resume(gid);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/tasks/{gid}")
    public ResponseEntity<Void> remove(@PathVariable String gid) {
        service.remove(gid);
        return ResponseEntity.noContent().build();
    }
}
