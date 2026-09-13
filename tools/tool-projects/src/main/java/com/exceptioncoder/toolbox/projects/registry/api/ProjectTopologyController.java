package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.projects.registry.application.TopologyExplorationService;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Run;
import com.exceptioncoder.toolbox.projects.registry.domain.TopologyKnowledge.View;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 基于登记系统身份启动跨项目取证。 */
@RestController
@RequestMapping("/api/project-registry/{id}/topology")
public class ProjectTopologyController {
    private final TopologyExplorationService exploration;
    public ProjectTopologyController(TopologyExplorationService exploration) { this.exploration = exploration; }
    @GetMapping public View view(@PathVariable String id) { return exploration.view(id); }
    @PostMapping("/explore")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Run explore(@PathVariable String id, @RequestBody Input input) {
        return exploration.start(id, input.engine(), input.scope(), input.projectIds());
    }
    /** 项目列表包含当前项目，最多四个。 */
    public record Input(String engine, String scope, List<String> projectIds) { }
}
