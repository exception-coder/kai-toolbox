package com.exceptioncoder.toolbox.eval.api;

import com.exceptioncoder.toolbox.eval.api.dto.StartRunRequest;
import com.exceptioncoder.toolbox.eval.domain.EvalResult;
import com.exceptioncoder.toolbox.eval.domain.EvalRun;
import com.exceptioncoder.toolbox.eval.service.EvalRunService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
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

/**
 * 评测运行与报告。
 * <ul>
 *   <li>{@code GET  /api/eval/runs/adapters} 可用被测适配器清单</li>
 *   <li>{@code POST /api/eval/runs} 发起评测（异步，立即返回 run）</li>
 *   <li>{@code GET  /api/eval/runs?dataset=&limit=} 历史运行</li>
 *   <li>{@code GET  /api/eval/runs/{id}} 运行详情（轮询进度）</li>
 *   <li>{@code GET  /api/eval/runs/{id}/results} 逐用例结果</li>
 *   <li>{@code GET  /api/eval/runs/{id}/extraction-summary} 抽取形态混淆矩阵</li>
 *   <li>{@code GET  /api/eval/runs/diff?base=&target=} 退化对比</li>
 *   <li>{@code DELETE /api/eval/runs/{id}} 删除运行及其结果</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/eval/runs")
public class EvalRunController {

    private final EvalRunService service;

    public EvalRunController(EvalRunService service) {
        this.service = service;
    }

    @GetMapping("/adapters")
    public List<Map<String, String>> adapters() {
        return service.listAdapters();
    }

    @PostMapping
    public ResponseEntity<EvalRun> start(@Valid @RequestBody StartRunRequest req) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.start(req));
    }

    @GetMapping
    public List<EvalRun> list(@RequestParam(required = false) String dataset,
                              @RequestParam(defaultValue = "50") int limit) {
        return service.listRuns(dataset, Math.min(Math.max(limit, 1), 200));
    }

    @GetMapping("/diff")
    public EvalRunService.DiffReport diff(@RequestParam String base, @RequestParam String target) {
        return service.diff(base, target);
    }

    @GetMapping("/{id}")
    public EvalRun get(@PathVariable String id) {
        return service.getRun(id);
    }

    @GetMapping("/{id}/results")
    public List<EvalResult> results(@PathVariable String id) {
        return service.listResults(id);
    }

    @GetMapping("/{id}/extraction-summary")
    public Map<String, Object> extractionSummary(@PathVariable String id) {
        return service.extractionSummary(id);
    }

    @PostMapping("/{id}/score-exports/retry")
    public Map<String, Integer> retryScoreExports(@PathVariable String id) {
        return Map.of("scheduled", service.retryScoreExports(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteRun(id);
        return ResponseEntity.noContent().build();
    }
}
