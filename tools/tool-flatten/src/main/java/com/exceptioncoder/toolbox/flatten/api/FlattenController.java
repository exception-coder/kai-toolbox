package com.exceptioncoder.toolbox.flatten.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.flatten.api.dto.DedupeRequest;
import com.exceptioncoder.toolbox.flatten.api.dto.DedupeResult;
import com.exceptioncoder.toolbox.flatten.api.dto.DuplicateGroupView;
import com.exceptioncoder.toolbox.flatten.api.dto.FileItemView;
import com.exceptioncoder.toolbox.flatten.api.dto.FlattenScanView;
import com.exceptioncoder.toolbox.flatten.api.dto.MovePlanItemView;
import com.exceptioncoder.toolbox.flatten.api.dto.StartScanRequest;
import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;
import com.exceptioncoder.toolbox.flatten.domain.FlattenScan;
import com.exceptioncoder.toolbox.flatten.domain.FlattenStatus;
import com.exceptioncoder.toolbox.flatten.repository.FlattenFileRepository;
import com.exceptioncoder.toolbox.flatten.repository.FlattenScanRepository;
import com.exceptioncoder.toolbox.flatten.service.FlattenService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/flatten")
public class FlattenController {

    private final FlattenService service;
    private final FlattenScanRepository scans;
    private final FlattenFileRepository files;
    private final SseEmitterRegistry sse;

    public FlattenController(FlattenService service,
                             FlattenScanRepository scans,
                             FlattenFileRepository files,
                             SseEmitterRegistry sse) {
        this.service = service;
        this.scans = scans;
        this.files = files;
        this.sse = sse;
    }

    @PostMapping("/scans")
    public FlattenScanView start(@Valid @RequestBody StartScanRequest req) {
        FlattenScan rec = service.startScan(req.sourcePath(), req.targetPath());
        return FlattenScanView.from(rec);
    }

    @GetMapping("/scans")
    public List<FlattenScanView> list() {
        return scans.findAll().stream().map(FlattenScanView::from).toList();
    }

    @GetMapping("/scans/{id}")
    public ResponseEntity<FlattenScanView> get(@PathVariable String id) {
        return scans.findById(id)
                .map(s -> ResponseEntity.ok(FlattenScanView.from(s)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/scans/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.cancel(id);
        scans.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/scans/{id}/scan-events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter scanEvents(@PathVariable String id) {
        String key = FlattenService.scanEventsKey(id);
        SseEmitter emitter = sse.create(key);
        scans.findById(id).ifPresent(s -> replayTerminalIfNeeded(s, key, ScanEventReplay.INSTANCE));
        return emitter;
    }

    @GetMapping(value = "/scans/{id}/move-events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter moveEvents(@PathVariable String id) {
        String key = FlattenService.moveEventsKey(id);
        SseEmitter emitter = sse.create(key);
        scans.findById(id).ifPresent(s -> replayTerminalIfNeeded(s, key, MoveEventReplay.INSTANCE));
        return emitter;
    }

    @GetMapping("/scans/{id}/duplicates")
    public List<DuplicateGroupView> duplicates(@PathVariable String id) {
        List<FlattenFile> rows = files.findDuplicates(id);
        Map<String, List<FlattenFile>> byHash = new LinkedHashMap<>();
        for (FlattenFile f : rows) {
            byHash.computeIfAbsent(f.getHash(), k -> new ArrayList<>()).add(f);
        }
        List<DuplicateGroupView> out = new ArrayList<>(byHash.size());
        for (Map.Entry<String, List<FlattenFile>> e : byHash.entrySet()) {
            List<FileItemView> items = e.getValue().stream().map(FileItemView::from).toList();
            out.add(new DuplicateGroupView(e.getKey(), e.getValue().get(0).getSize(), items));
        }
        // 大组靠前（按 size × (count-1) 即可释放空间排序）
        out.sort((a, b) -> Long.compare(
                b.size() * (b.files().size() - 1L),
                a.size() * (a.files().size() - 1L)));
        return out;
    }

    @DeleteMapping("/scans/{id}/duplicates")
    public DedupeResult deleteDuplicates(@PathVariable String id, @RequestBody DedupeRequest req) {
        FlattenService.DedupeOutcome r = service.deleteDuplicates(id,
                req.keepPaths() == null ? List.of() : req.keepPaths());
        return new DedupeResult(r.deleted(), r.freedSize());
    }

    @PostMapping("/scans/{id}/skip-dedupe")
    public FlattenScanView skipDedupe(@PathVariable String id) {
        return FlattenScanView.from(service.skipDedupe(id));
    }

    @GetMapping("/scans/{id}/move-plan")
    public List<MovePlanItemView> movePlan(@PathVariable String id) {
        return service.getMovePlan(id).stream().map(MovePlanItemView::from).toList();
    }

    @PostMapping("/scans/{id}/move")
    public FlattenScanView startMove(@PathVariable String id) {
        return FlattenScanView.from(service.startMove(id));
    }

    // -- SSE terminal-state replay -----------------------------------------

    /**
     * If a client subscribes after the worker already finished, the original event was lost.
     * This helper re-emits the appropriate terminal event so the UI can settle.
     */
    private void replayTerminalIfNeeded(FlattenScan s, String key, ReplayKind kind) {
        FlattenStatus st = s.getStatus();
        if (kind == ScanEventReplay.INSTANCE) {
            if (st == FlattenStatus.SCANNED || st == FlattenStatus.READY
                    || st == FlattenStatus.MOVING || st == FlattenStatus.COMPLETED) {
                sse.publish(key, "completed", Map.of(
                        "totalFiles", s.getTotalFiles(),
                        "totalSize", s.getTotalSize(),
                        "duplicateGroups", s.getDuplicateGroups(),
                        "duplicateFiles", s.getDuplicateFiles(),
                        "duplicateSize", s.getDuplicateSize()));
                sse.complete(key);
            } else if (st == FlattenStatus.FAILED) {
                sse.publish(key, "error", Map.of("message", s.getErrorMsg() == null ? "scan failed" : s.getErrorMsg()));
                sse.complete(key);
            } else if (st == FlattenStatus.CANCELLED) {
                sse.publish(key, "cancelled", Map.of("scanId", s.getId()));
                sse.complete(key);
            }
        } else {
            if (st == FlattenStatus.COMPLETED) {
                sse.publish(key, "completed", Map.of("movedFiles", s.getMovedFiles()));
                sse.complete(key);
            } else if (st == FlattenStatus.FAILED) {
                sse.publish(key, "error", Map.of("message", s.getErrorMsg() == null ? "move failed" : s.getErrorMsg()));
                sse.complete(key);
            } else if (st == FlattenStatus.CANCELLED) {
                sse.publish(key, "cancelled", Map.of("scanId", s.getId()));
                sse.complete(key);
            }
        }
    }

    private interface ReplayKind {}
    private enum ScanEventReplay implements ReplayKind { INSTANCE }
    private enum MoveEventReplay implements ReplayKind { INSTANCE }
}
