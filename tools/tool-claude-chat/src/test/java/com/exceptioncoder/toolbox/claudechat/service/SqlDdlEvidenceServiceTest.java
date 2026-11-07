package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SqlDdlEvidenceServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void marksProductionConstructorAsSpringInjectionPoint() throws Exception {
        var constructor = SqlDdlEvidenceService.class.getConstructor(ClaudeChatSessionRepository.class);

        assertThat(constructor.isAnnotationPresent(Autowired.class)).isTrue();
    }

    @Test
    void resolvesProjectAndReturnsOnlyRequestedTableFragments() throws Exception {
        Path knowledgeRoot = tempDir.resolve("knowledge");
        Path baseline = knowledgeRoot.resolve("schema.sql");
        Files.createDirectories(baseline.getParent());
        Files.writeString(baseline, """
                # DDL

                ## ORDER_HEADER
                CREATE TABLE ORDER_HEADER (ID BIGINT, STATUS VARCHAR(20));

                ## ORDER_LINE
                CREATE TABLE ORDER_LINE (ID BIGINT, ORDER_ID BIGINT);
                """);
        Path cwd = knowledgeRoot;
        Files.createDirectories(cwd);

        SqlDdlEvidenceService service = serviceFor(cwd, knowledgeRoot);
        SqlDdlEvidence result = service.prepare(
                "session-1", "新增订单字段", List.of("order_header"), null);

        assertThat(result.status()).isEqualTo(SqlDdlEvidence.STATUS_VERIFIED);
        assertThat(result.project()).isEqualTo("knowledge");
        assertThat(result.verifiedTables()).containsExactly("ORDER_HEADER");
        assertThat(result.ddlFragments()).containsOnlyKeys("ORDER_HEADER");
        assertThat(result.ddlFragments().get("ORDER_HEADER")).doesNotContain("ORDER_LINE");
    }

    @Test
    void ignoresRetiredInheritanceAndMarkdownSnapshots() throws Exception {
        Path cwd = tempDir.resolve("current");
        Files.createDirectories(cwd.resolve("docs/domain/impl"));
        Files.writeString(cwd.resolve("docs/domain/impl/ddl-baseline.md"), "CREATE TABLE LEGACY (ID INT);");
        Files.writeString(cwd.resolve("docs/domain/impl/project-context.json"), "{\"ddlSource\":{\"project\":\"legacy\"}}");
        var service = serviceFor(cwd, tempDir);
        assertThat(service.prepare("session-1", "核验", List.of("LEGACY"), null).status())
                .isEqualTo(SqlDdlEvidence.STATUS_DDL_MISSING);
        assertThat(service.prepare("session-1", "核验", List.of("LEGACY"), "another").status())
                .isEqualTo(SqlDdlEvidence.STATUS_PROJECT_AMBIGUOUS);
    }

    @Test
    void reportsPartialEvidenceAndRevalidatesSqlTablesAtRegistration() throws Exception {
        Path knowledgeRoot = tempDir.resolve("knowledge");
        Path baseline = knowledgeRoot.resolve("schema.sql");
        Files.createDirectories(baseline.getParent());
        Files.writeString(baseline, "CREATE TABLE KNOWN_TABLE (ID BIGINT);\n");
        Path cwd = knowledgeRoot;
        Files.createDirectories(cwd);

        SqlDdlEvidenceService service = serviceFor(cwd, knowledgeRoot);
        SqlDdlEvidence prepared = service.prepare(
                "session-1", "数据回填", List.of("known_table"), null);
        SqlDdlEvidence verified = service.verifyRegistration(
                "session-1", "UPDATE unknown_table SET value = 1", prepared.evidenceId());

        assertThat(prepared.status()).isEqualTo(SqlDdlEvidence.STATUS_VERIFIED);
        assertThat(verified.status()).isEqualTo(SqlDdlEvidence.STATUS_DDL_MISSING);
        assertThat(verified.missingTables()).containsExactly("UNKNOWN_TABLE");
    }

    @Test
    void invalidatesEvidenceWhenBaselineChangesBeforeRegistration() throws Exception {
        Path knowledgeRoot = tempDir.resolve("knowledge");
        Path baseline = knowledgeRoot.resolve("schema.sql");
        Files.createDirectories(baseline.getParent());
        Files.writeString(baseline, "CREATE TABLE QUOTE (ID BIGINT);\n");
        Path cwd = knowledgeRoot;
        Files.createDirectories(cwd);

        SqlDdlEvidenceService service = serviceFor(cwd, knowledgeRoot);
        SqlDdlEvidence prepared = service.prepare("session-1", "报价表变更", List.of("quote"), null);
        Files.writeString(baseline, "CREATE TABLE OTHER_TABLE (ID BIGINT);\n");

        SqlDdlEvidence verified = service.verifyRegistration(
                "session-1", "ALTER TABLE quote ADD COLUMN amount DECIMAL(12, 2);", prepared.evidenceId());

        assertThat(verified.status()).isEqualTo(SqlDdlEvidence.STATUS_DDL_MISSING);
        assertThat(verified.missingTables()).containsExactly("QUOTE");
    }

    @Test
    void extractsChangedTablesAcrossDdlAndDmlStatements() {
        SqlDdlEvidenceService service = serviceFor(tempDir, tempDir.resolve("knowledge"));

        assertThat(service.extractSqlTables("""
                -- comment
                ALTER TABLE app.customer ADD COLUMN enabled INTEGER;
                INSERT INTO `order_line` (id) VALUES (1);
                UPDATE [ORDER_HEADER] SET status = 'DONE';
                INSERT INTO ORDER_HEADER (ID) VALUES (1)
                ON DUPLICATE KEY UPDATE STATUS = 'DONE';
                CREATE INDEX IDX_ORDER_STATUS ON ORDER_HEADER (STATUS);
                """))
                .containsExactly("CUSTOMER", "ORDER_LINE", "ORDER_HEADER");
    }

    @Test
    void doesNotCertifyCreateSnapshotWhenLaterMigrationExists() throws Exception {
        Files.writeString(tempDir.resolve("schema.sql"), "CREATE TABLE ORDERS(ID INT);");
        Files.writeString(tempDir.resolve("change.sql"), "ALTER TABLE ORDERS ADD AMOUNT INT;");
        var result = serviceFor(tempDir, tempDir).prepare("session-1", "核验", List.of("ORDERS"), null);
        assertThat(result.status()).isEqualTo(SqlDdlEvidence.STATUS_DDL_MISSING);
        assertThat(result.warning()).contains("后续结构变更");
    }

    private SqlDdlEvidenceService serviceFor(Path cwd, Path knowledgeRoot) {
        ClaudeChatSessionRepository repository = mock(ClaudeChatSessionRepository.class);
        ClaudeChatSession session = ClaudeChatSession.builder().id("session-1").cwd(cwd.toString()).build();
        when(repository.findById("session-1")).thenReturn(Optional.of(session));
        return new SqlDdlEvidenceService(repository);
    }
}
