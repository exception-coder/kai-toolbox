package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDatabasePolicy;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

/** 配置视图只投影已发布流程和原资源目录，不另存连接或自动切换数据库。 */
@RestController
@RequireRole("ADMIN")
public class ConsultAdminResourceController {
    private final ReadonlyResourceGateway resources;
    private final ConsultWorkflowService workflows;

    public ConsultAdminResourceController(ReadonlyResourceGateway resources, ConsultWorkflowService workflows) {
        this.resources = resources; this.workflows = workflows;
    }

    @GetMapping("/api/fore-consult/resources/configuration")
    public View get() {
        var current = workflows.current();
        var selected = ConsultDatabasePolicy.effective(current.workflow()).nodes().stream()
                .filter(node -> node.enabled() && node.tools().contains("consult_resource_query"))
                .flatMap(node -> node.resourceBindingIds().stream()).distinct().toList();
        return new View(current.version(), selected, resources.catalog());
    }

    /** selectedBindingIds属于已发布流程，资源状态与地址每次读取当前配置。 */
    public record View(Long workflowVersion, List<String> selectedBindingIds, List<ReadonlyResourceGateway.Entry> resources) { }
}
