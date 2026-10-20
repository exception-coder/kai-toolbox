package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultSourceRoutingService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultSourceSyncService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 管理员从已保存咨询候选逐项主动同步，不接收任意目录或Git命令。 */
@RestController
@RequestMapping("/api/fore-consult/source-sync")
@RequireRole("ADMIN")
public class ConsultSourceSyncController {
    private final ConsultSourceRoutingService routing;
    private final ConsultSourceSyncService sync;

    public ConsultSourceSyncController(ConsultSourceRoutingService routing, ConsultSourceSyncService sync) {
        this.routing = routing;
        this.sync = sync;
    }

    @GetMapping
    public List<ConsultSourceRouting.Project> candidates() {
        return routing.candidates();
    }

    @PostMapping("/{project}")
    public ConsultSourceSyncService.Result synchronize(@PathVariable String project) {
        return sync.synchronizeCandidate(project);
    }
}
