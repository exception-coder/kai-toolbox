package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultPersonalWebService;
import org.springframework.web.bind.annotation.*;

/** 仅供本人鉴权表单；不向模型注册凭据提交工具。 */
@RestController
@RequireAuth
@RequestMapping("/api/fore-consult/sessions/{consultId}/personal-web")
public class ConsultPersonalWebController {
    private final ConsultPersonalWebService service;
    public ConsultPersonalWebController(ConsultPersonalWebService service) { this.service = service; }
    @GetMapping public ConsultPersonalWebService.State status(@PathVariable String consultId) { return service.status(consultId); }
    @PostMapping public ConsultPersonalWebService.State login(@PathVariable String consultId, @RequestBody ConsultPersonalWebService.Credentials credentials) {
        return service.login(consultId, credentials);
    }
    @DeleteMapping public void logout(@PathVariable String consultId) { service.logout(consultId); }
    @PostMapping("/check") public ConsultPersonalWebService.State check(@PathVariable String consultId) { return service.check(consultId); }
}
