package com.exceptioncoder.toolbox.ops.resources.api;

import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ops/application-resources")
public class ApplicationResourceController {
    private final ApplicationResourceService service;

    public ApplicationResourceController(ApplicationResourceService service) { this.service = service; }

    @GetMapping public List<View> list() { return service.list().stream().map(View::from).toList(); }
    @PostMapping public View create(@RequestBody ApplicationResourceService.Command command) {
        return View.from(service.create(command));
    }
    @PutMapping("/{id}") public View update(@PathVariable String id,
                                             @RequestBody ApplicationResourceService.Command command) {
        return View.from(service.update(id, command));
    }
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    public record View(String id, String name, String environment, String baseUrl, String authType,
                       String loginPath, String username, boolean credentialConfigured, String usernameField,
                       String passwordField, String tokenJsonPath, String tenantHeader, String tenantValue) {
        static View from(ApplicationResource value) {
            return new View(value.id(), value.name(), value.environment(), value.baseUrl(), value.authType().name(),
                    value.loginPath(), value.username(), value.hasPassword(), value.usernameField(),
                    value.passwordField(), value.tokenJsonPath(), value.tenantHeader(), value.tenantValue());
        }
    }
}
