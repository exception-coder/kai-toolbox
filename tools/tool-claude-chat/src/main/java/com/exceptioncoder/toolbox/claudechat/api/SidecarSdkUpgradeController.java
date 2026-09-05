package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SidecarSdkUpgradeService;
import com.exceptioncoder.toolbox.claudechat.service.SidecarSdkUpgradeService.UpgradeStatus;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 固定引擎升级入口；任务持续于服务器，浏览器断开不取消。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/claude-chat/sidecar/upgrade")
public class SidecarSdkUpgradeController {
    private final SidecarSdkUpgradeService service;

    public SidecarSdkUpgradeController(SidecarSdkUpgradeService service) { this.service = service; }

    @GetMapping
    public UpgradeStatus status() { return service.status(); }

    @PostMapping
    public UpgradeStatus upgrade(@RequestParam String engine) { return service.start(engine); }
}
