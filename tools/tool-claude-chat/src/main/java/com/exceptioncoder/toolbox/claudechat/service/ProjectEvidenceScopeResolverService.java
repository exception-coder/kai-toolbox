package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;
import com.exceptioncoder.toolbox.claudechat.domain.ResolvedProjectRouteBinding;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceProject;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRelation;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRole;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 从受控工作区和长期项目关系解析规划证据范围。 */
@Service
public class ProjectEvidenceScopeResolverService implements ProjectEvidenceScopeResolver {

    private final ProjectRouteBindingService bindingService;
    private final ProjectDependencyService dependencyService;
    private final TeamToolsPathService teamToolsPathService;

    public ProjectEvidenceScopeResolverService(
            ProjectRouteBindingService bindingService,
            ProjectDependencyService dependencyService,
            TeamToolsPathService teamToolsPathService
    ) {
        this.bindingService = bindingService;
        this.dependencyService = dependencyService;
        this.teamToolsPathService = teamToolsPathService;
    }

    @Override
    public ProjectEvidenceScope resolve(String project) {
        ResolvedProjectRouteBinding primaryBinding = bindingService.resolve(project);
        ProjectEvidenceProject primary = coordinate(
                primaryBinding.projectKey(), primaryBinding.projectPath(), ProjectEvidenceRelation.PRIMARY);
        List<ProjectEvidenceProject> related = dependencyService.resolve(primaryBinding.projectPath()).stream()
                .map(this::relatedCoordinate)
                .toList();
        String fingerprint = primary.projectPath() + "\n" + related.stream()
                .map(item -> item.projectPath() + ":" + item.relation())
                .reduce("", (left, right) -> left + "\n" + right);
        String scopeId = UUID.nameUUIDFromBytes(fingerprint.getBytes(StandardCharsets.UTF_8)).toString();
        return new ProjectEvidenceScope(scopeId, primary, related);
    }

    private ProjectEvidenceProject relatedCoordinate(ProjectDependency dependency) {
        ProjectEvidenceRelation relation = ProjectEvidenceRelation.valueOf(dependency.relation());
        return coordinate(dependency.projectKey(), dependency.projectPath(), relation);
    }

    private ProjectEvidenceProject coordinate(
            String projectKey,
            String projectPath,
            ProjectEvidenceRelation relation
    ) {
        Path path = Path.of(projectPath).toAbsolutePath().normalize();
        Path knowledgeProject = teamToolsPathService.knowledgeProject(projectKey);
        EnumMap<ProjectEvidenceSourceType, Boolean> availability =
                new EnumMap<>(ProjectEvidenceSourceType.class);
        availability.put(ProjectEvidenceSourceType.SOURCE, Files.isDirectory(path));
        availability.put(ProjectEvidenceSourceType.GRAPHIFY,
                Files.isRegularFile(path.resolve("graphify-out").resolve("graph.json")));
        availability.put(ProjectEvidenceSourceType.DOMAIN_KNOWLEDGE, Files.isDirectory(knowledgeProject));
        availability.put(ProjectEvidenceSourceType.DDL,
                Files.isRegularFile(knowledgeProject.resolve("impl").resolve("ddl-baseline.md")));
        availability.put(ProjectEvidenceSourceType.ROUTE_MAP, routeMapExists(projectKey));
        availability.put(ProjectEvidenceSourceType.CROSS_PROJECT_TOPOLOGY, topologyExists(projectKey));
        return new ProjectEvidenceProject(
                projectKey,
                path.toString(),
                relation,
                roleFor(relation),
                Map.copyOf(availability));
    }

    private boolean routeMapExists(String projectKey) {
        return Files.isRegularFile(teamToolsPathService.routeMap(projectKey));
    }

    private boolean topologyExists(String projectKey) {
        return Files.isDirectory(teamToolsPathService.topologyProject(projectKey));
    }

    private static ProjectEvidenceRole roleFor(ProjectEvidenceRelation relation) {
        return switch (relation) {
            case PRIMARY -> ProjectEvidenceRole.CURRENT_IMPLEMENTATION;
            case REFACTORS -> ProjectEvidenceRole.LEGACY_SOURCE;
            case MIGRATES_FROM -> ProjectEvidenceRole.MIGRATION_SOURCE;
            case DEPENDS_ON -> ProjectEvidenceRole.DEPENDENCY;
            case INTEGRATES_WITH -> ProjectEvidenceRole.INTEGRATION_PARTNER;
        };
    }

}
