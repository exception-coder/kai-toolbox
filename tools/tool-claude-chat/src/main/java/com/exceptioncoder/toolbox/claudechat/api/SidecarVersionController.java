package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView;
import com.exceptioncoder.toolbox.claudechat.service.SidecarVersionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** sidecar 所用 Claude Agent SDK 的版本自检（只读；升级仍由用户手动执行）。 */
@RestController
@RequestMapping("/api/claude-chat/sidecar")
public class SidecarVersionController {

    private final SidecarVersionService service;

    public SidecarVersionController(SidecarVersionService service) {
        this.service = service;
    }

    /**
     * 读 sidecar 的 SDK 版本状态。
     *
     * @param check true 时联网查 npm 最新版并判断是否落后（较慢，按需触发）
     */
    @GetMapping("/version")
    public SidecarVersionView version(@RequestParam(defaultValue = "false") boolean check) {
        return service.read(check);
    }
}
