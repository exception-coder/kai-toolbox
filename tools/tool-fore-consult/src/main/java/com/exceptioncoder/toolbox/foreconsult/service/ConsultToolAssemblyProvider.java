package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentPolicy;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDatabasePolicy;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentToolAssemblyProvider;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.stream.Stream;

/** 从冻结快照装配证据能力，叠加平台受控文档工具，不接受客户端工具清单。 */
@Component
public class ConsultToolAssemblyProvider implements AgentToolAssemblyProvider {
    private final com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService workflowService;
    @org.springframework.beans.factory.annotation.Autowired
    private ConsultResourceAccess resourceAccess;
    private final ConsultSessionRepository sessions;
    private final ConsultWorkflowRepository workflows;

    public ConsultToolAssemblyProvider(ConsultSessionRepository sessions, ConsultWorkflowRepository workflows,
                                       com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService workflowService) {
        this.workflowService = workflowService;
        this.sessions = sessions;
        this.workflows = workflows;
    }

    @Override
    public Optional<Assembly> resolve(String runtimeSessionId) {
        return sessions.findByDevSessionId(runtimeSessionId)
                .map(session -> {
                    var snapshot = workflows.session(session.getSessionId()).map(value ->
                            new ConsultWorkflowRepository.Snapshot(value.version(), ConsultDatabasePolicy.effective(value.workflow())));
                    var request = new com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationRequest(
                            "以本轮用户消息为准", session.getSystemName(), session.getSystemSourcePath(),
                            session.getModuleNames() == null ? java.util.List.of() : java.util.List.of(session.getModuleNames()),
                            session.getRole(), true, session.getEvidenceRouteSnapshot());
                    return new Assembly(Stream.concat(snapshot.stream().flatMap(value -> value.workflow().tools().stream()),
                                    Stream.concat(ConsultDocumentPolicy.TOOLS.stream(), Stream.of("read_consult_attachment"))).distinct().toList(),
                            Stream.concat(snapshot.stream().flatMap(value -> value.workflow().mcpServers().stream()),
                                    Stream.of("consult-readonly")).distinct().toList(),
                            snapshot.map(value -> workflowService.render(request, value).prompt())
                                    .orElse("【受控文档生成】" + ConsultDocumentPolicy.INSTRUCTIONS)
                                    + "\n【数据库访问边界】" + ConsultDatabasePolicy.INSTRUCTIONS
                                    + "\n【上传附件】文本或HTML附件使用read_consult_attachment分段读取，用nextOffset继续；超过2MB不等于不可读，读取上限由管理员动态配置。禁止改用source_read绕过附件身份。HTML脚本/内嵌图片不代表已解析数据，未解析部分必须明确说明。",
                            resourceAccess == null ? null : resourceAccess.issue(runtimeSessionId));
                });
    }
}
