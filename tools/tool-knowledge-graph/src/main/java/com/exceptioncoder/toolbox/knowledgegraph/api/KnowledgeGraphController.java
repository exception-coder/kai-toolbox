package com.exceptioncoder.toolbox.knowledgegraph.api;

import com.exceptioncoder.toolbox.knowledgegraph.api.dto.ProjectPathRequest;
import com.exceptioncoder.toolbox.knowledgegraph.api.dto.RepoPathsView;
import com.exceptioncoder.toolbox.knowledgegraph.api.dto.StatusCacheView;
import com.exceptioncoder.toolbox.knowledgegraph.api.dto.StatusRefreshRequest;
import com.exceptioncoder.toolbox.knowledgegraph.config.KnowledgeGraphProperties;
import com.exceptioncoder.toolbox.knowledgegraph.model.DomainKnowledgeStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyProjectStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectRef;
import com.exceptioncoder.toolbox.knowledgegraph.service.DomainKnowledgeStatusService;
import com.exceptioncoder.toolbox.knowledgegraph.service.GraphifyProjectStatusService;
import com.exceptioncoder.toolbox.knowledgegraph.service.LocalProjectSelectionService;
import com.exceptioncoder.toolbox.knowledgegraph.service.StatusCacheService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/knowledge-graph")
public class KnowledgeGraphController {

    private final LocalProjectSelectionService projectSelection;
    private final GraphifyProjectStatusService graphifyStatus;
    private final DomainKnowledgeStatusService domainKnowledgeStatus;
    private final StatusCacheService statusCache;
    private final KnowledgeGraphProperties properties;

    public KnowledgeGraphController(LocalProjectSelectionService projectSelection,
                                     GraphifyProjectStatusService graphifyStatus,
                                     DomainKnowledgeStatusService domainKnowledgeStatus,
                                     StatusCacheService statusCache,
                                     KnowledgeGraphProperties properties) {
        this.projectSelection = projectSelection;
        this.graphifyStatus = graphifyStatus;
        this.domainKnowledgeStatus = domainKnowledgeStatus;
        this.statusCache = statusCache;
        this.properties = properties;
    }

    @GetMapping("/repo-paths")
    public RepoPathsView repoPaths() {
        return new RepoPathsView(properties.getDomainKnowledgeRepoPath(), properties.getCrossTopologyRepoPath());
    }

    @GetMapping("/projects/recent")
    public List<ProjectRef> recentProjects() {
        return projectSelection.recentProjects();
    }

    @PostMapping("/projects/resolve")
    public ProjectRef resolveProject(@RequestBody ProjectPathRequest req) {
        ProjectRef ref = projectSelection.resolve(req.path());
        projectSelection.recordRecent(ref);
        return ref;
    }

    @GetMapping("/graphify/status")
    public GraphifyProjectStatus getGraphifyStatus(@RequestParam String path) {
        return graphifyStatus.detectStatus(path);
    }

    @GetMapping("/domain-knowledge/status")
    public DomainKnowledgeStatus getDomainKnowledgeStatus(@RequestParam String path) {
        return domainKnowledgeStatus.detectStatus(path, GraphRepo.DOMAIN_KNOWLEDGE);
    }

    @GetMapping("/cross-topology/status")
    public DomainKnowledgeStatus getCrossTopologyStatus(@RequestParam String path) {
        return domainKnowledgeStatus.detectStatus(path, GraphRepo.CROSS_TOPOLOGY);
    }

    @GetMapping("/status-cache")
    public StatusCacheView getStatusCache() {
        return new StatusCacheView(statusCache.getCached());
    }

    @PostMapping("/status-cache/refresh")
    public StatusCacheView refreshStatusCache(@RequestBody StatusRefreshRequest req) {
        return new StatusCacheView(statusCache.refresh(req.paths()));
    }
}
