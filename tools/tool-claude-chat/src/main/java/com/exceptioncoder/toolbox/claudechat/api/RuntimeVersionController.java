package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.RuntimeVersionService;
import com.exceptioncoder.toolbox.claudechat.service.RuntimeVersionService.RuntimeVersion;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 运行版本与待加载提交；只读，不触发重启。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/claude-chat/runtime/version")
public class RuntimeVersionController {
    private final RuntimeVersionService service;

    public RuntimeVersionController(RuntimeVersionService service) { this.service = service; }

    @GetMapping
    public RuntimeVersion current(@RequestParam(defaultValue = "false") boolean refresh) {
        return service.current(refresh);
    }
}
