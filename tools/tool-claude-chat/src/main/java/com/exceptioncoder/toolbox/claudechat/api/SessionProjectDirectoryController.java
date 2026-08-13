package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 会话级附加项目目录接口。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/project-directories")
public class SessionProjectDirectoryController {

    private final SessionProjectDirectoryService service;

    public SessionProjectDirectoryController(SessionProjectDirectoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<String> list(@PathVariable String sessionId) {
        return service.list(sessionId);
    }

    @PutMapping
    public ResponseEntity<Void> replace(@PathVariable String sessionId,
                                        @RequestBody ProjectDirectoriesRequest request) {
        return service.replace(sessionId, request == null ? List.of() : request.paths())
                ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    public record ProjectDirectoriesRequest(List<String> paths) {
    }
}
