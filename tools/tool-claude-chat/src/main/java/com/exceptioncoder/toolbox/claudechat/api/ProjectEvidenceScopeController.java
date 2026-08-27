package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 公开受控项目证据范围，供探索插件和诊断页面使用。 */
@RestController
@RequestMapping("/api/claude-chat/project-evidence")
public class ProjectEvidenceScopeController {

    private final ProjectEvidenceScopeResolver resolver;

    public ProjectEvidenceScopeController(ProjectEvidenceScopeResolver resolver) {
        this.resolver = resolver;
    }

    /** 返回主项目和已登记关联项目的规范范围。 */
    @GetMapping("/scope")
    public ProjectEvidenceScope scope(@RequestParam String project) {
        return resolver.resolve(project);
    }
}
