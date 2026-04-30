package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.api.dto.NodeView;
import com.exceptioncoder.toolbox.treesize.api.dto.ScanView;
import com.exceptioncoder.toolbox.treesize.api.dto.StartScanRequest;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import com.exceptioncoder.toolbox.treesize.service.ScanService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/treesize")
public class TreeSizeController {

    private final ScanService scanService;
    private final ScanRepository scans;
    private final NodeRepository nodes;
    private final SseEmitterRegistry sse;

    public TreeSizeController(ScanService scanService,
                              ScanRepository scans,
                              NodeRepository nodes,
                              SseEmitterRegistry sse) {
        this.scanService = scanService;
        this.scans = scans;
        this.nodes = nodes;
        this.sse = sse;
    }

    @PostMapping("/scans")
    public ScanView start(@Valid @RequestBody StartScanRequest req) {
        ScanRecord rec = scanService.startScan(req.path());
        return ScanView.from(rec);
    }

    @GetMapping(value = "/scans/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String id) {
        return sse.create(id);
    }

    @GetMapping("/scans/{id}")
    public ResponseEntity<ScanView> get(@PathVariable String id) {
        return scans.findById(id)
                .map(r -> ResponseEntity.ok(ScanView.from(r)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/scans")
    public List<ScanView> list() {
        return scans.findAll().stream().map(ScanView::from).toList();
    }

    @GetMapping("/scans/{id}/children")
    public List<NodeView> children(@PathVariable String id, @RequestParam(required = false) String path) {
        return nodes.findChildren(id, path).stream().map(NodeView::from).toList();
    }

    @DeleteMapping("/scans/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        scanService.cancel(id);
        scans.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
