package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.WorkingDirectoryBrowser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/claude-chat/workspaces")
public class WorkingDirectoryController {
    private final WorkingDirectoryBrowser browser;

    public WorkingDirectoryController(WorkingDirectoryBrowser browser) {
        this.browser = browser;
    }

    @GetMapping("/directory-roots")
    public List<String> roots() {
        return browser.roots();
    }

    @GetMapping("/directories")
    public WorkingDirectoryBrowser.Listing browse(@RequestParam(required = false) String path) {
        return browser.browse(path);
    }
}
