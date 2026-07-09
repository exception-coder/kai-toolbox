package com.exceptioncoder.toolbox.ops.api;

import com.exceptioncoder.toolbox.ops.api.dto.DatasourceConnection;
import com.exceptioncoder.toolbox.ops.api.dto.DatasourceRequest;
import com.exceptioncoder.toolbox.ops.api.dto.DatasourceView;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.service.OpsDatasourceService;
import com.exceptioncoder.toolbox.ops.service.OpsQueryService;
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

@RestController
@RequestMapping("/api/ops/datasources")
public class OpsDatasourceController {

    private final OpsDatasourceService service;
    private final OpsQueryService queryService;

    public OpsDatasourceController(OpsDatasourceService service, OpsQueryService queryService) {
        this.service = service;
        this.queryService = queryService;
    }

    @GetMapping
    public List<DatasourceView> list(@RequestParam(required = false) String systemId) {
        var list = systemId == null || systemId.isBlank()
                ? service.findAll()
                : service.findBySystem(systemId);
        return list.stream().map(DatasourceView::from).toList();
    }

    @GetMapping("/{id}")
    public DatasourceView get(@PathVariable String id) {
        return DatasourceView.from(service.findRequired(id));
    }

    /**
     * 完整连接信息（<b>含密码明文</b>）——仅供本机回环内部消费（如 ERP 需求开发「带入」测试库）。
     * 单用户本地无鉴权模型下，本地进程本可直读 SQLite，此处返回凭据不额外扩大攻击面。
     */
    @GetMapping("/{id}/connection")
    public DatasourceConnection connection(@PathVariable String id) {
        return DatasourceConnection.from(service.findRequired(id));
    }

    @PostMapping
    public DatasourceView create(@Valid @RequestBody DatasourceRequest req) {
        return DatasourceView.from(service.create(req));
    }

    @PutMapping("/{id}")
    public DatasourceView update(@PathVariable String id, @Valid @RequestBody DatasourceRequest req) {
        return DatasourceView.from(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 测试已保存实例的连通性。 */
    @PostMapping("/{id}/test")
    public TestResult test(@PathVariable String id) {
        return queryService.test(id);
    }
}
