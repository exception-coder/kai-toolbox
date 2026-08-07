package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.ErpMiniProgramConfigService;
import com.exceptioncoder.toolbox.claudechat.service.ErpMiniProgramConfigService.EnvironmentMode;
import com.exceptioncoder.toolbox.claudechat.service.ErpMiniProgramConfigService.EnvironmentView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** ERP 小程序运行模式的读取、切换与恢复；不接收或保存 AppSecret。 */
@RestController
@RequestMapping("/api/claude-chat/erp-mini-program/environment")
public class ErpMiniProgramConfigController {

    private final ErpMiniProgramConfigService service;

    public ErpMiniProgramConfigController(ErpMiniProgramConfigService service) {
        this.service = service;
    }

    @GetMapping
    public EnvironmentView read(@RequestParam String cwd) {
        return service.read(cwd);
    }

    @PutMapping
    public EnvironmentView apply(@RequestBody ApplyRequest request) {
        return service.apply(request.cwd(), request.mode(), request.apiBaseUrl());
    }

    @PostMapping("/restore")
    public EnvironmentView restore(@RequestBody RestoreRequest request) {
        return service.restore(request.cwd());
    }

    /** 应用运行模式请求。 */
    public record ApplyRequest(String cwd, EnvironmentMode mode, String apiBaseUrl) {
    }

    /** 恢复原始项目配置请求。 */
    public record RestoreRequest(String cwd) {
    }
}
