package com.exceptioncoder.toolbox.portprocess.api;

import com.exceptioncoder.toolbox.portprocess.api.dto.KillResult;
import com.exceptioncoder.toolbox.portprocess.api.dto.PortLookupResult;
import com.exceptioncoder.toolbox.portprocess.service.PortLookupService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/port-process")
public class PortProcessController {

    private final PortLookupService service;

    public PortProcessController(PortLookupService service) {
        this.service = service;
    }

    @GetMapping
    public PortLookupResult lookup(@RequestParam("port") int port) {
        return service.lookup(port);
    }

    @PostMapping("/kill")
    public KillResult kill(@RequestParam("pid") long pid,
                           @RequestParam(name = "force", defaultValue = "false") boolean force) {
        return service.kill(pid, force);
    }
}
