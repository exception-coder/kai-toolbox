package com.exceptioncoder.toolbox.knowledgegraph.service;

import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectRef;

import java.util.List;

public interface LocalProjectSelectionService {

    List<ProjectRef> recentProjects();

    ProjectRef resolve(String absolutePath);

    void recordRecent(ProjectRef project);
}
