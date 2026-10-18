package com.exceptioncoder.toolbox.claudechat.workassistants;

import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import org.springframework.stereotype.Service;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;

/** 只在平台侧收集有界事实，不向模型提供任意目录或命令执行能力。 */
@Service
public class AssistantEvidence {
    private final ProjectCatalog catalog;
    private final ProjectAccess access;
    private final GitLogService git;
    private final List<ResourceProvider> resources;

    public AssistantEvidence(ProjectCatalog catalog, ProjectAccess access, GitLogService git,
                             List<ResourceProvider> resources) {
        this.catalog = catalog;
        this.access = access;
        this.git = git;
        this.resources = resources;
    }

    public List<ProjectCatalog.Entry> projects() {
        return catalog.list(false).stream().filter(value -> value.available() && !value.excluded()).toList();
    }

    public String collect(String assistant, Scope scope) {
        if ("resources".equals(assistant)) {
            StringBuilder text = new StringBuilder("资源元数据（非连通性证明，不含秘密）：\n");
            for (ResourceProvider provider : resources) {
                for (var value : provider.resources()) {
                    text.append(value.id()).append(' ').append(value.name()).append(' ')
                            .append(value.environment()).append(' ')
                            .append(value.configurationUrl()).append('\n');
                    if (text.length() > 40_000) {
                        throw new IllegalArgumentException("资源目录超过上限，请到资源中心按系统查看");
                    }
                }
            }
            return text.toString();
        }
        if (scope == null || scope.projectIds() == null || scope.projectIds().isEmpty() || scope.projectIds().size() > 5
                || scope.author() == null || scope.author().isBlank() || scope.author().length() > 120
                || scope.from() == null || scope.through() == null) {
            throw new IllegalArgumentException("请选择 1–5 个项目、日期范围，并填写作者姓名或邮箱");
        }
        LocalDate from;
        LocalDate through;
        try {
            from = LocalDate.parse(scope.from());
            through = LocalDate.parse(scope.through());
        } catch (java.time.format.DateTimeParseException failure) {
            throw new IllegalArgumentException("请提供有效日期");
        }
        if (through.isBefore(from) || ChronoUnit.DAYS.between(from, through) > 31) {
            throw new IllegalArgumentException("周报范围最多 32 天，结束日不能早于开始日");
        }
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        StringBuilder text = new StringBuilder("来源：已有本地及远端引用，未刷新远端，不代表已上线。时区 Asia/Shanghai；提交时间口径。\n")
                .append("日期：").append(from).append(" 至 ").append(through).append("；作者精确匹配：")
                .append(scope.author()).append('\n');
        var seen = new HashSet<Path>();
        for (String id : scope.projectIds()) {
            var project = projects().stream().filter(value -> value.id().equals(id)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("项目已不可用，请重新选择"));
            try {
                Path path = Path.of(project.path()).toRealPath();
                access.requireAllowed(path);
                path = git.repositoryRoot(path).toRealPath();
                access.requireAllowed(path);
                if (seen.add(path)) {
                    text.append("\n项目：").append(project.name()).append('\n')
                            .append(git.readReportEvidence(path, from.atStartOfDay(zone).toInstant(),
                                    through.plusDays(1).atStartOfDay(zone).toInstant(), scope.author()));
                }
            } catch (java.io.IOException failure) {
                throw new IllegalArgumentException("项目目录不可访问，请重新选择");
            }
            if (text.length() > 80_000) {
                throw new IllegalArgumentException("周报证据超过 80000 字符，请缩小项目或日期范围");
            }
        }
        return text.toString();
    }

    /** 仅声明采集范围，不允许客户端传任意路径。 */
    public record Scope(List<String> projectIds, String from, String through, String author) { }
}
