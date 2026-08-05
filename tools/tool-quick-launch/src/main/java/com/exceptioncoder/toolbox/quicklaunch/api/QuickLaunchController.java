package com.exceptioncoder.toolbox.quicklaunch.api;

import com.exceptioncoder.toolbox.quicklaunch.api.dto.QuickSiteUpsertRequest;
import com.exceptioncoder.toolbox.quicklaunch.api.dto.QuickSiteView;
import com.exceptioncoder.toolbox.quicklaunch.service.QuickLaunchService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/quick-launch/sites")
public class QuickLaunchController {

    private final QuickLaunchService service;

    public QuickLaunchController(QuickLaunchService service) {
        this.service = service;
    }

    @GetMapping
    public List<QuickSiteView> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public QuickSiteView create(@Valid @RequestBody QuickSiteUpsertRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public QuickSiteView update(@PathVariable String id, @Valid @RequestBody QuickSiteUpsertRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.delete(id);
    }

    @PostMapping("/{id}/opened")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recordOpened(@PathVariable String id) {
        service.recordOpened(id);
    }
}
