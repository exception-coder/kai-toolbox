package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.api.dto.TopologyRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.TopologyView;
import com.exceptioncoder.toolbox.foreconsult.service.TopologyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 系统链路分析端点。路径前缀 {@code /api/fore-consult/topology}。
 * 读取历史系统连线，旧分析请求返回明确的退役状态。
 */
@RestController
@RequestMapping("/api/fore-consult/topology")
public class TopologyController {

    private final TopologyService service;

    public TopologyController(TopologyService service) {
        this.service = service;
    }

    /** 已持久化的链路（前端加载时读取渲染）。 */
    @GetMapping
    public TopologyView list() {
        return service.listPersisted();
    }

    /** 分析系统链路（同步，内部在虚拟线程跑引擎；引擎默认 120s 超时），结果整表持久化。 */
    @PostMapping
    public TopologyView analyze(@RequestBody TopologyRequest req) {
        return service.analyze(req.systems(), req.engine());
    }
}
