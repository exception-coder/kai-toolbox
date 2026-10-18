package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDatabasePolicy;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import org.springframework.stereotype.Service;
import java.util.List;

/** 每次执行读取冻结的节点资源选择，不接受客户端指定系统或连接。 */
@Service
public class ConsultResourceService {
    @org.springframework.beans.factory.annotation.Autowired
    private ConsultSourceRoutingService sourceRouting;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.common.resource.WebResourceGateway webResources;
    private final ConsultSessionRepository sessions;
    private final ConsultWorkflowRepository workflows;
    private final ReadonlyResourceGateway gateway;

    public ConsultResourceService(ConsultSessionRepository sessions, ConsultWorkflowRepository workflows,
                                  ReadonlyResourceGateway gateway) {
        this.sessions = sessions; this.workflows = workflows; this.gateway = gateway;
    }

    public List<ReadonlyResourceGateway.Entry> catalog() {
        return java.util.stream.Stream.concat(gateway.catalog().stream(), webResources == null
                ? java.util.stream.Stream.empty() : webResources.catalog().stream()).toList();
    }

    public List<ReadonlyResourceGateway.Entry> webResources(String runtimeId) {
        var selected = scope(runtimeId, "consult_web");
        return webResources.discover(selected.sourcePath(), selected.bindings());
    }

    public Object webPage(String runtimeId, com.exceptioncoder.toolbox.common.resource.WebResourceGateway.Request request) {
        var selected = scope(runtimeId, "consult_web");
        return webResources.read(runtimeId, selected.sourcePath(), selected.bindings(), request);
    }

    public List<ReadonlyResourceGateway.Entry> discover(String runtimeId) {
        var scope = scope(runtimeId, "consult_resources");
        return gateway.discover(scope.sourcePath(), scope.bindings());
    }

    public Object query(String runtimeId, String bindingId, String sql) {
        var scope = scope(runtimeId, "consult_resource_query");
        if (!scope.bindings().contains(bindingId)) {
            throw new IllegalArgumentException("本咨询未选择该数据库；请到Agent管理的业务咨询流程节点配置资源后发布，新建咨询使用新选择");
        }
        return gateway.query(scope.sourcePath(), scope.bindings(), bindingId, sql);
    }

    private Scope scope(String runtimeId, String tool) {
        var session = sessions.findByDevSessionId(runtimeId)
                .orElseThrow(() -> new IllegalArgumentException("未关联咨询会话"));
        var routing = sourceRouting == null
                ? com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting.read(session.getEvidenceRouteSnapshot())
                : sourceRouting.current(session);
        if (routing != null && routing.focusedProject() == null) {
            throw new IllegalArgumentException("尚未定位服务端，请先探索源码并通过 source_projects 保存有证据的服务端焦点；不能按启动锚点查询数据库");
        }
        var snapshot = workflows.session(session.getSessionId())
                .orElseThrow(() -> new IllegalArgumentException("咨询没有冻结的资源配置"));
        var nodes = ConsultDatabasePolicy.effective(snapshot.workflow()).nodes().stream()
                .filter(node -> node.enabled() && node.tools().contains(tool)).toList();
        if (nodes.isEmpty()) throw new IllegalArgumentException("本咨询未装配该资源工具");
        return new Scope(session.getSystemSourcePath(), nodes.stream()
                .flatMap(node -> node.resourceBindingIds().stream()).distinct().toList());
    }
    private record Scope(String sourcePath, List<String> bindings) { }
}
