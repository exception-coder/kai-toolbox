package com.exceptioncoder.toolbox.knowledgegraph.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.repository.DynamicConfigOverrideRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/** 清理已改为约定路径、不再支持动态覆盖的历史配置。 */
@Component
public class RetiredKnowledgeGraphConfigCleaner implements ApplicationRunner {

    private static final List<String> RETIRED_KEYS = List.of(
            "toolbox.knowledge-graph.domain-knowledge-repo-path",
            "toolbox.knowledge-graph.cross-topology-repo-path"
    );

    private final DynamicConfigOverrideRepository repository;

    public RetiredKnowledgeGraphConfigCleaner(DynamicConfigOverrideRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(ApplicationArguments args) {
        repository.deleteByPrefixes(RETIRED_KEYS);
    }
}
