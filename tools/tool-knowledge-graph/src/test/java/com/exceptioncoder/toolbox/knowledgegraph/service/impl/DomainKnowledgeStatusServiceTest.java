package com.exceptioncoder.toolbox.knowledgegraph.service.impl;
import com.exceptioncoder.toolbox.knowledgegraph.config.KnowledgeGraphProperties;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.model.RegistrationState;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.Path;
import java.nio.file.Files;
import static org.junit.jupiter.api.Assertions.*;

class DomainKnowledgeStatusServiceTest {
    @Test
    void retiredDomainReturnsGoneWithoutStartingAnyEngine() {
        var props = new KnowledgeGraphProperties();
        props.setNodeExecutable("unavailable-node");
        var service = new DomainKnowledgeStatusServiceImpl(props);
        assertEquals("", props.getDomainKnowledgeRepoPath());
        var error = assertThrows(ResponseStatusException.class,
            () -> service.detectStatus("missing-project", GraphRepo.DOMAIN_KNOWLEDGE));
        assertEquals(410, error.getStatusCode().value());
    }

    @Test
    void topologyUsesItsOwnModuleAndEnvironmentWithoutInheritedProjects(@TempDir Path root) throws Exception {
        Files.createDirectories(root.resolve("dist"));
        Files.writeString(root.resolve("package.json"), "{\"type\":\"module\"}");
        Files.writeString(root.resolve("dist/knowledge.js"), """
            export function listModules(project, options) {
              if (project !== 'demo' || options.inheritSources !== false || !process.env.TOPOLOGY_KB_DIR)
                throw new Error('wrong scope');
              return [{module:'relations',count:2}];
            }
            """);
        var props = new KnowledgeGraphProperties() {
            @Override public String getCrossTopologyRepoPath() { return root.toString(); }
        };
        var result = new DomainKnowledgeStatusServiceImpl(props).detectStatus(
            root.resolve("demo").toString(), GraphRepo.CROSS_TOPOLOGY);
        assertEquals(RegistrationState.REGISTERED, result.state());
        assertEquals(1, result.coveredModules());
        Files.writeString(root.resolve("dist/knowledge.js"), "throw new Error('unavailable');");
        assertEquals(503, assertThrows(ResponseStatusException.class, () ->
            new DomainKnowledgeStatusServiceImpl(props).detectStatus("demo", GraphRepo.CROSS_TOPOLOGY))
                .getStatusCode().value());
    }
}
