package com.exceptioncoder.toolbox.ops.api;

import com.exceptioncoder.toolbox.ops.api.dto.HistoryView;
import com.exceptioncoder.toolbox.ops.api.dto.RedisExecRequest;
import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryRequest;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.service.OpsQueryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ops/datasources/{id}")
public class OpsQueryController {

    private final OpsQueryService service;

    public OpsQueryController(OpsQueryService service) {
        this.service = service;
    }

    @PostMapping("/sql/query")
    public SqlQueryResult sqlQuery(@PathVariable String id, @Valid @RequestBody SqlQueryRequest req) {
        return service.sqlQuery(id, req.sql(), req.maxRows());
    }

    @PostMapping("/redis/exec")
    public RedisExecResult redisExec(@PathVariable String id, @Valid @RequestBody RedisExecRequest req) {
        return service.redisExec(id, req.command());
    }

    @GetMapping("/history")
    public List<HistoryView> history(@PathVariable String id,
                                     @RequestParam(defaultValue = "50") int limit) {
        return service.history(id, limit).stream().map(HistoryView::from).toList();
    }
}
