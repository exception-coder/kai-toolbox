package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import com.exceptioncoder.toolbox.projects.registry.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 将系统任务登记到现有需求池，并固定画像版本用于后续 Agent 交接。 */
@Service
public class SystemTaskService {
    private final ProjectRegistryService projects;
    private final ProjectRegistryStore store;
    private final RequirementRegistrationPort requirements;

    public SystemTaskService(ProjectRegistryService projects, ProjectRegistryStore store,
                             RequirementRegistrationPort requirements) {
        this.projects = projects;
        this.store = store;
        this.requirements = requirements;
    }

    @Transactional
    public SystemTaskBinding create(String projectId, TaskInput input) {
        RegistryProject project = projects.require(projectId);
        if (input.title() == null || input.title().isBlank() || input.title().length() > 200
                || input.description() == null || input.description().isBlank() || input.description().length() > 20000) {
            throw new IllegalArgumentException("请输入任务标题（最多 200 字）和描述（最多 20000 字）");
        }
        if ((input.context() != null && input.context().length() > 10000)
                || (input.domainId() != null && input.domainId().length() > 120)) {
            throw new IllegalArgumentException("业务域或补充上下文过长");
        }
        String id = requirements.registerPendingExecution(new RequirementRegistrationCommand(input.title().trim(),
                input.description().trim(), project.metadata().name(), input.domainId(), null));
        SystemTaskBinding binding = new SystemTaskBinding(id, projectId, project.profileVersion(), input.title().trim(),
                input.description().trim(), input.domainId(), input.context(), System.currentTimeMillis());
        store.bindTask(binding);
        return binding;
    }

    public String handoff(String projectId, String taskId) {
        var detail = projects.detail(projectId);
        var task = store.task(projectId, taskId)
                .orElseThrow(() -> new IllegalArgumentException("该任务不属于当前系统"));
        StringBuilder result = new StringBuilder("请在以下已登记系统中处理任务，先核对当前源码与画像新鲜度。\n");
        result.append("System ID: ").append(projectId).append("\n系统：").append(detail.project().metadata().name())
                .append("\n项目根：").append(detail.project().metadata().localPath())
                .append("\n当前状态：").append(detail.project().state())
                .append("\nTask ID: ").append(task.id()).append("\n绑定画像版本：").append(task.profileVersion());
        store.profile(projectId, task.profileVersion()).ifPresentOrElse(profile -> appendProfile(result, profile),
                () -> result.append("\n尚无初始化画像，请先执行系统初始化，不得推断已有代码/DDL证据。"));
        result.append("\n\n任务：").append(task.title()).append("\n").append(task.description());
        if (task.domainId() != null && !task.domainId().isBlank()) {
            result.append("\n业务域（用户提供，待核对）：").append(task.domainId());
        }
        if (task.context() != null && !task.context().isBlank()) {
            result.append("\n补充上下文：").append(task.context());
        }
        return result.toString();
    }

    private void appendProfile(StringBuilder result, SystemProfile profile) {
        result.append("\n来源指纹：").append(profile.fingerprint());
        for (var asset : profile.assets()) {
            result.append("\n").append(asset.title()).append(" [").append(asset.status()).append("]：")
                    .append(String.join(", ", asset.sources().stream().limit(15).toList()));
        }
        result.append("\n证据缺口：").append(String.join("；", profile.gaps()));
        result.append("\n先读取项目执行规则，再经 Graphify 收敛代码范围；验证命令只表示发现，不表示通过。");
    }

    /** 系统任务输入，模块选择不属于必填契约。 */
    public record TaskInput(
            /** 标题。 */ String title,
            /** 原始描述。 */ String description,
            /** 可选业务域。 */ String domainId,
            /** 可选上下文。 */ String context
    ) { }
}
