package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultBugView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.RegisterBugRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.UpdateBugStatusRequest;
import com.exceptioncoder.toolbox.foreconsult.service.BugService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * BUG 登记体系端点。路径前缀 {@code /api/fore-consult/bugs}。
 *
 * <ul>
 *   <li>{@code POST   /bugs}              — 登记 BUG（带去重累加）</li>
 *   <li>{@code GET    /bugs}              — 最近 100 条</li>
 *   <li>{@code PUT    /bugs/{id}/status}  — 人工核实流转状态</li>
 *   <li>{@code DELETE /bugs/{id}}         — 删除</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/fore-consult/bugs")
public class BugController {

    private final BugService service;

    public BugController(BugService service) {
        this.service = service;
    }

    @PostMapping
    public ConsultBugView register(@Valid @RequestBody RegisterBugRequest req) {
        return ConsultBugView.from(service.register(req));
    }

    /**
     * @param status 可重复的状态过滤（如 {@code ?status=CONFIRMED&status=REJECTED}），省略则不过滤
     * @param limit  上限，默认 100，钳制在 1~1000
     */
    @GetMapping
    public List<ConsultBugView> list(@RequestParam(required = false) List<String> status,
                                     @RequestParam(defaultValue = "100") int limit) {
        int capped = Math.min(Math.max(limit, 1), 1000);
        return service.listRecent(status, capped).stream().map(ConsultBugView::from).toList();
    }

    @PutMapping("/{id}/status")
    public ConsultBugView updateStatus(@PathVariable String id, @Valid @RequestBody UpdateBugStatusRequest req) {
        return ConsultBugView.from(service.updateStatus(id, req.status()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
