package com.exceptioncoder.toolbox.docker.api;

import com.exceptioncoder.toolbox.docker.api.dto.ComposeActionRequest;
import com.exceptioncoder.toolbox.docker.api.dto.ComposeActionResponse;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerStatsResponse;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerView;
import com.exceptioncoder.toolbox.docker.domain.ComposeAction;
import com.exceptioncoder.toolbox.docker.domain.ComposeOptions;
import com.exceptioncoder.toolbox.docker.domain.ContainerAction;
import com.exceptioncoder.toolbox.docker.service.DockerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/docker/hosts/{hostId}")
public class DockerContainerController {

    private final DockerService service;

    public DockerContainerController(DockerService service) {
        this.service = service;
    }

    @GetMapping("/containers")
    public List<ContainerView> list(@PathVariable String hostId,
                                    @RequestParam(required = false) String appId,
                                    @RequestParam(required = false, defaultValue = "true") boolean includeStopped,
                                    @RequestParam(required = false, defaultValue = "false") boolean nocache) {
        return service.listContainers(hostId, appId, includeStopped, nocache);
    }

    @PostMapping("/containers/{cid}/{action}")
    public ResponseEntity<Void> containerAction(@PathVariable String hostId,
                                                @PathVariable String cid,
                                                @PathVariable String action) {
        service.containerAction(hostId, cid, ContainerAction.parse(action));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/containers/stats")
    public ContainerStatsResponse stats(@PathVariable String hostId,
                                        @RequestParam(required = false, defaultValue = "false") boolean nocache) {
        return service.stats(hostId, nocache);
    }

    @PostMapping("/apps/{appId}/compose/{action}")
    public ComposeActionResponse composeAction(@PathVariable String hostId,
                                               @PathVariable String appId,
                                               @PathVariable String action,
                                               @RequestBody(required = false) ComposeActionRequest body) {
        ComposeOptions opts = toOptions(body);
        return service.composeAction(hostId, appId, ComposeAction.parse(action), opts);
    }

    private static ComposeOptions toOptions(ComposeActionRequest req) {
        if (req == null) return ComposeOptions.defaults();
        boolean detach = req.detach() == null || req.detach();
        boolean removeOrphans = req.removeOrphans() != null && req.removeOrphans();
        String pullPolicy = (req.pullPolicy() == null || req.pullPolicy().isBlank())
                ? "missing" : req.pullPolicy();
        return new ComposeOptions(detach, removeOrphans, pullPolicy);
    }
}
