package com.exceptioncoder.toolbox.workline.api;

import com.exceptioncoder.toolbox.workline.api.dto.EntryUpsertRequest;
import com.exceptioncoder.toolbox.workline.api.dto.EntryView;
import com.exceptioncoder.toolbox.workline.api.dto.WorklineUpsertRequest;
import com.exceptioncoder.toolbox.workline.api.dto.WorklineView;
import com.exceptioncoder.toolbox.workline.service.WorklineService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 工作线模块 REST 入口：工作线（lines）与条目（entries）两组 CRUD。
 *
 * <p>not-found 由本控制器局部 {@code @ExceptionHandler} 转 404——
 * 局部处理优先级高于 {@code GlobalExceptionHandler} 中 {@code Exception -> 500} 的兜底。
 */
@RestController
@RequestMapping("/api/workline")
public class WorklineController {

    private final WorklineService service;

    public WorklineController(WorklineService service) {
        this.service = service;
    }

    // ---------- 工作线 ----------

    @GetMapping("/lines")
    public List<WorklineView> listLines() {
        return service.listLines();
    }

    @PostMapping("/lines")
    @ResponseStatus(HttpStatus.CREATED)
    public WorklineView createLine(@Valid @RequestBody WorklineUpsertRequest req) {
        return service.createLine(req);
    }

    @PutMapping("/lines/{id}")
    public WorklineView updateLine(@PathVariable long id, @Valid @RequestBody WorklineUpsertRequest req) {
        return service.updateLine(id, req);
    }

    @DeleteMapping("/lines/{id}")
    public ResponseEntity<Void> deleteLine(@PathVariable long id) {
        service.deleteLine(id);
        return ResponseEntity.noContent().build();
    }

    // ---------- 条目 ----------

    @GetMapping("/lines/{id}/entries")
    public List<EntryView> listEntries(@PathVariable long id) {
        return service.listEntries(id);
    }

    @PostMapping("/lines/{id}/entries")
    @ResponseStatus(HttpStatus.CREATED)
    public EntryView createEntry(@PathVariable long id, @Valid @RequestBody EntryUpsertRequest req) {
        return service.createEntry(id, req);
    }

    @PutMapping("/entries/{id}")
    public EntryView updateEntry(@PathVariable long id, @Valid @RequestBody EntryUpsertRequest req) {
        return service.updateEntry(id, req);
    }

    @DeleteMapping("/entries/{id}")
    public ResponseEntity<Void> deleteEntry(@PathVariable long id) {
        service.deleteEntry(id);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", HttpStatus.NOT_FOUND.value(),
                "error", HttpStatus.NOT_FOUND.getReasonPhrase(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }
}
