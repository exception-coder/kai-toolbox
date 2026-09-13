package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import org.springframework.stereotype.Service;
import java.util.List;

/** 每次执行读取冻结的节点资源选择，不接受客户端指定系统或连接。 */
@Service
public class ConsultResourceService {
    private final ConsultSessionRepository sessions;
    private final ConsultWorkflowRepository workflows;
    private final ReadonlyResourceGateway gateway;

    public ConsultResourceService(ConsultSessionRepository sessions, ConsultWorkflowRepository workflows,
                                  ReadonlyResourceGateway gateway) {
        this.sessions = sessions; this.workflows = workflows; this.gateway = gateway;
    }

    public List<ReadonlyResourceGateway.Entry> catalog() { return gateway.catalog(); }

    public List<ReadonlyResourceGateway.Entry> discover(String runtimeId) {
        var scope = scope(runtimeId, "consult_resources");
        return gateway.discover(scope.sourcePath(), scope.bindings());
    }

    public Object query(String runtimeId, String bindingId, String sql) {
        var scope = scope(runtimeId, "consult_resource_query");
        return gateway.query(scope.sourcePath(), scope.bindings(), bindingId, sql);
    }

    private Scope scope(String runtimeId, String tool) {
        var session = sessions.findByDevSessionId(runtimeId)
                .orElseThrow(() -> new IllegalArgumentException("未关联咨询会话"));
        var snapshot = workflows.session(session.getSessionId())
                .orElseThrow(() -> new IllegalArgumentException("咨询没有冻结的资源配置"));
        var nodes = snapshot.workflow().nodes().stream()
                .filter(node -> node.enabled() && node.tools().contains(tool)).toList();
        if (nodes.isEmpty()) throw new IllegalArgumentException("本咨询未装配该资源工具");
        return new Scope(session.getSystemSourcePath(), nodes.stream()
                .flatMap(node -> node.resourceBindingIds().stream()).distinct().toList());
    }
    private record Scope(String sourcePath, List<String> bindings) { }
}
