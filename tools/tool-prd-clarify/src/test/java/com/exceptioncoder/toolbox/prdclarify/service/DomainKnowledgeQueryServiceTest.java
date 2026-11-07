package com.exceptioncoder.toolbox.prdclarify.service;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import java.nio.file.Files;
import java.nio.file.Path;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
class DomainKnowledgeQueryServiceTest {
    @Test
    void readsOnlySelectedProjectAndRefreshesFiles(@TempDir Path root) throws Exception {
        Path doc = root.resolve("docs/domain/payment.md");
        Files.createDirectories(doc.getParent());
        Files.writeString(doc, "payment: confirmed=false");
        var service = new DomainKnowledgeQueryService(
            new com.exceptioncoder.toolbox.prdclarify.config.DomainKnowledgeQueryProperties(),
            new MockEnvironment().withProperty("toolbox.knowledge-graph.domain-knowledge-repo-path", "/unavailable"),
            new com.fasterxml.jackson.databind.ObjectMapper());
        service.setScopes(scopes(root));
        assertThat(service.query("demo", "payment")).contains("payment.md", "confirmed=false");
        Files.writeString(doc, "payment: updated rule");
        assertThat(service.query("demo", "payment")).contains("updated rule").doesNotContain("confirmed=false");
        assertThat(service.query("other", "payment")).isNull();
        Files.delete(doc);
        assertThat(service.query("demo", "payment")).isNull();
    }
    private ProjectEvidenceScopeResolver scopes(Path root) {
        var resolver = mock(ProjectEvidenceScopeResolver.class, RETURNS_DEEP_STUBS);
        when(resolver.resolve("demo").primary().projectPath()).thenReturn(root.toString());
        when(resolver.resolve("other")).thenThrow(new IllegalArgumentException("not authorized"));
        return resolver;
    }
}
