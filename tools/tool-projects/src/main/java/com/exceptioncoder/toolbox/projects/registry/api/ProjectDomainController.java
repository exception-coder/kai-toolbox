package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.projects.registry.application.DomainExplorationService;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Run;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.View;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** 项目内领域探索与持久化结果入口。 */
@RestController
@RequestMapping("/api/project-registry/{id}/domains")
public class ProjectDomainController {
    private final DomainExplorationService exploration;
    public ProjectDomainController(DomainExplorationService exploration) { this.exploration = exploration; }
    @GetMapping public View view(@PathVariable String id) { return exploration.view(id); }
    @PostMapping("/explore")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Run explore(@PathVariable String id, @RequestBody Input input) {
        return exploration.start(id, input.engine(), input.scope());
    }
    public record Input(String engine, String scope) { }
}
