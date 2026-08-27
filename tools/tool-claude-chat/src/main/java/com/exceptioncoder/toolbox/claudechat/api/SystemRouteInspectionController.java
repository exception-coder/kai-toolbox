package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteCandidateView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView;
import com.exceptioncoder.toolbox.claudechat.service.ProjectRouteBindingService;
import com.exceptioncoder.toolbox.claudechat.service.SystemRouteInspectionService;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 提供项目路由候选与完整性检测。 */
@Validated
@RestController
@RequestMapping("/api/claude-chat/system-route-inspections")
public class SystemRouteInspectionController {

    private final ProjectRouteBindingService bindingService;
    private final SystemRouteInspectionService inspectionService;

    public SystemRouteInspectionController(
            ProjectRouteBindingService bindingService,
            SystemRouteInspectionService inspectionService
    ) {
        this.bindingService = bindingService;
        this.inspectionService = inspectionService;
    }

    /** 返回所有可检测或待绑定的知识项目。 */
    @GetMapping("/systems")
    public List<SystemRouteCandidateView> systems() {
        return bindingService.list().stream()
                .map(binding -> new SystemRouteCandidateView(
                        binding.projectKey(), binding.displayName(), binding.projectPath(), binding.source(),
                        binding.sourceAvailable(), binding.knowledgeAvailable()))
                .toList();
    }

    /** 按项目名称、模块名称和可选 URL 执行只读路由检查。 */
    @GetMapping
    public SystemRouteInspectionView inspect(
            @RequestParam @Size(max = 160) String project,
            @RequestParam(required = false) @Size(max = 200) String module,
            @RequestParam(required = false) @Size(max = 2_000) String url
    ) {
        return inspectionService.inspect(project, module, url);
    }
}
