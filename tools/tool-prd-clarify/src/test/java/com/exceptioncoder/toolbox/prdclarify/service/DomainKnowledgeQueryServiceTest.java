package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.config.DomainKnowledgeQueryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class DomainKnowledgeQueryServiceTest {

    @Test
    void shouldExecuteKnowledgeModuleWhosePathContainsSpaces(@TempDir Path tempDir) throws Exception {
        Assumptions.assumeTrue(nodeIsAvailable(), "Node.js is required for this integration test");

        Path repo = Files.createDirectories(tempDir.resolve("domain knowledge repo"));
        Path dist = Files.createDirectories(repo.resolve("dist"));
        Files.writeString(repo.resolve("package.json"), "{\"type\":\"module\"}");
        Files.writeString(dist.resolve("knowledge.js"), """
                export const search = ({ project, query }) => [{
                  id: 'rule-1', type: 'flow', title: query, project, module: 'checkout'
                }];
                export const get = () => ({ content: 'Knowledge body' });
                """);

        DomainKnowledgeQueryProperties props = new DomainKnowledgeQueryProperties();
        props.setTimeoutSeconds(10);
        MockEnvironment environment = new MockEnvironment()
                .withProperty("toolbox.knowledge-graph.domain-knowledge-repo-path", repo.toString());
        DomainKnowledgeQueryService service =
                new DomainKnowledgeQueryService(props, environment, new ObjectMapper());

        String result = service.query("demo-project", "payment flow");

        assertThat(result)
                .contains("### [flow] payment flow (demo-project/checkout)")
                .contains("Knowledge body");
    }

    private static boolean nodeIsAvailable() {
        try {
            Process process = new ProcessBuilder("node", "--version").start();
            return process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }
}
