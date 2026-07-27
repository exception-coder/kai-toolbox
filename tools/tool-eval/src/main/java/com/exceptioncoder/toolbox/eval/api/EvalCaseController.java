package com.exceptioncoder.toolbox.eval.api;

import com.exceptioncoder.toolbox.eval.api.dto.SaveCaseRequest;
import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import com.exceptioncoder.toolbox.eval.repository.EvalCaseRepository;
import com.exceptioncoder.toolbox.eval.service.EvalCaseService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
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
import java.util.Map;

/**
 * 黄金集用例管理。
 * <ul>
 *   <li>{@code GET  /api/eval/cases?scenario=&dataset=} 查询用例</li>
 *   <li>{@code GET  /api/eval/cases/datasets} 数据集清单与用例数</li>
 *   <li>{@code GET  /api/eval/cases/{id}} 用例详情</li>
 *   <li>{@code POST /api/eval/cases} 新建用例</li>
 *   <li>{@code POST /api/eval/cases/import} 批量导入（按 sourceRef 幂等）</li>
 *   <li>{@code PUT  /api/eval/cases/{id}} 更新用例</li>
 *   <li>{@code DELETE /api/eval/cases/{id}} 删除用例</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/eval/cases")
public class EvalCaseController {

    private final EvalCaseService service;

    public EvalCaseController(EvalCaseService service) {
        this.service = service;
    }

    @GetMapping
    public List<EvalCase> list(@RequestParam(required = false) String scenario,
                               @RequestParam(required = false) String dataset) {
        return service.search(scenario, dataset);
    }

    @GetMapping("/datasets")
    public List<EvalCaseRepository.DatasetStat> datasets() {
        return service.listDatasets();
    }

    /** 可纳入的样本来源及各自「待纳入」条数。 */
    @GetMapping("/sources")
    public List<EvalCaseService.SourceStat> sources() {
        return service.listSources();
    }

    /**
     * 从某来源一键纳入黄金集，按 sourceRef 幂等。
     *
     * @param dataset 目标数据集名，省略则用来源 id
     */
    @PostMapping("/harvest")
    public EvalCaseService.HarvestResult harvest(@RequestParam String source,
                                                 @RequestParam(required = false) String dataset) {
        return service.harvest(source, dataset);
    }

    @GetMapping("/{id}")
    public EvalCase get(@PathVariable String id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<EvalCase> create(@Valid @RequestBody SaveCaseRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> importBatch(@Valid @RequestBody List<SaveCaseRequest> requests) {
        int created = service.importBatch(requests);
        return ResponseEntity.ok(Map.of("received", requests.size(), "created", created,
                "skipped", requests.size() - created));
    }

    @PutMapping("/{id}")
    public EvalCase update(@PathVariable String id, @Valid @RequestBody SaveCaseRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
