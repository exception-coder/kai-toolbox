package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.config.GraphifyProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectContextResolutionTest {

    @TempDir
    Path directory;

    @Test
    void graphLookupUsesResolvedManagedProject() throws Exception {
        Path project = directory.resolve("managed/business");
        Files.createDirectories(project.resolve("graphify-out"));
        Files.writeString(project.resolve("graphify-out/graph.json"), "{}");
        StaticListableBeanFactory factory = resolver("business", project);
        GraphifyQueryService service = new GraphifyQueryService(new GraphifyProperties(),
                factory.getBeanProvider(LocalProjectResolver.class), null);

        assertThat(service.traceTarget("business", null)).isEqualTo(project.resolve("graphify-out/graph.json").toString());
        assertThat(service.traceTarget("missing", null)).isNull();
    }

    @Test
    void explicitGraphPathWorksWithoutAResolver() throws Exception {
        Files.createDirectories(directory.resolve("graphify-out"));
        Files.writeString(directory.resolve("graphify-out/graph.json"), "{}");
        GraphifyQueryService service = new GraphifyQueryService(new GraphifyProperties(),
                new StaticListableBeanFactory().getBeanProvider(LocalProjectResolver.class), null);

        assertThat(service.traceTarget(directory.toString(), null))
                .isEqualTo(directory.resolve("graphify-out/graph.json").toString());
        assertThat(service.traceTarget("missing", null)).isNull();
    }

    @Test
    void topologyUsesTheSameResolverAndReadsItsKnowledge() throws Exception {
        Path project = directory.resolve("managed/cross-project-topology");
        Files.createDirectories(project.resolve("knowledge"));
        Files.writeString(project.resolve("knowledge/relation.md"), "ERP connects to SRM");
        PrdTopologyContextService service = new PrdTopologyContextService(
                resolver("cross-project-topology", project).getBeanProvider(LocalProjectResolver.class));

        assertThat(service.traceTarget()).isEqualTo(project.resolve("knowledge").toString());
        assertThat(service.query("ERP", "SRM", "关系")).contains("ERP connects to SRM", "relation.md");
    }

    @Test
    void topologyGracefullyHandlesMissingResolverAndMissingKnowledge() {
        PrdTopologyContextService absent = new PrdTopologyContextService(
                new StaticListableBeanFactory().getBeanProvider(LocalProjectResolver.class));
        PrdTopologyContextService empty = new PrdTopologyContextService(
                resolver("cross-project-topology", directory).getBeanProvider(LocalProjectResolver.class));

        assertThat(absent.query("ERP", null, "关系")).isNull();
        assertThat(empty.traceTarget()).isNull();
    }

    private StaticListableBeanFactory resolver(String name, Path path) {
        StaticListableBeanFactory factory = new StaticListableBeanFactory();
        factory.addBean("projectResolver", (LocalProjectResolver) requested -> requested.equals(name)
                ? Optional.of(new LocalProjectResolver.ProjectLocation(name, path.toString())) : Optional.empty());
        return factory;
    }
}
