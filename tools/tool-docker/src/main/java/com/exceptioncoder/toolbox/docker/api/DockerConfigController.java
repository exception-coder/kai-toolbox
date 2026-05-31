package com.exceptioncoder.toolbox.docker.api;

import com.exceptioncoder.toolbox.docker.api.dto.ComposeFileView;
import com.exceptioncoder.toolbox.docker.api.dto.FileContentView;
import com.exceptioncoder.toolbox.docker.api.dto.FileWriteRequest;
import com.exceptioncoder.toolbox.docker.api.dto.FileWriteResponse;
import com.exceptioncoder.toolbox.docker.service.DockerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.nio.file.NoSuchFileException;
import java.util.List;

@RestController
@RequestMapping("/api/docker/hosts/{hostId}/apps/{appId}/files")
public class DockerConfigController {

    private final DockerService service;

    public DockerConfigController(DockerService service) {
        this.service = service;
    }

    @GetMapping
    public List<ComposeFileView> listFiles(@PathVariable String hostId, @PathVariable String appId) {
        return service.listFiles(hostId, appId);
    }

    @GetMapping("/content")
    public FileContentView readFile(@PathVariable String hostId, @PathVariable String appId,
                                    @RequestParam String path) throws NoSuchFileException {
        return service.readFile(hostId, appId, path);
    }

    @PutMapping("/content")
    public FileWriteResponse writeFile(@PathVariable String hostId, @PathVariable String appId,
                                       @Valid @RequestBody FileWriteRequest req) {
        return service.writeFile(hostId, appId, req.path(), req.content());
    }
}
