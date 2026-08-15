package com.exceptioncoder.toolbox.reqpool.api;

import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolution;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolutionPort;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeSource;
import com.exceptioncoder.toolbox.reqpool.api.dto.CreateReqRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.ReqItemViewAssembler;
import com.exceptioncoder.toolbox.reqpool.api.dto.UpdateReqRequest;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.service.ReqAnalysisService;
import com.exceptioncoder.toolbox.reqpool.service.ReqDevelopmentAccessPolicy;
import com.exceptioncoder.toolbox.reqpool.service.ReqInsightFingerprint;
import com.exceptioncoder.toolbox.reqpool.service.ReqRequirementTypeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReqPoolRequirementTypeIntegrationTest {

    @TempDir
    Path tempDir;

    private JdbcTemplate jdbc;
    private ReqPoolController controller;

    @BeforeEach
    void setUp() {
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + tempDir.resolve("reqpool.db"));
        jdbc = new JdbcTemplate(dataSource);
        createSchema();

        RequirementTypeResolutionPort port = mock(RequirementTypeResolutionPort.class);
        when(port.resolveRequirementType("订单报错", "提交失败", null, null))
                .thenReturn(new RequirementTypeResolution(
                        RequirementType.BUG_FIX,
                        RequirementTypeSource.AI,
                        0.75
                ));
        when(port.resolveRequirementType("调整订单", "修改已有流程", null, null))
                .thenReturn(new RequirementTypeResolution(
                        RequirementType.MODULE_ADJUST,
                        RequirementTypeSource.AI,
                        0.7
                ));
        @SuppressWarnings("unchecked")
        ObjectProvider<RequirementTypeResolutionPort> provider = mock(ObjectProvider.class);
        when(provider.orderedStream()).thenAnswer(invocation -> Stream.of(port));

        ReqItemRepository repository = new ReqItemRepository(jdbc);
        ReqInsightFingerprint insightFingerprint = new ReqInsightFingerprint();
        controller = new ReqPoolController(
                repository,
                jdbc,
                mock(ReqAnalysisService.class),
                mock(ReqDevelopmentAccessPolicy.class),
                new ReqRequirementTypeService(provider),
                new ReqItemViewAssembler(new ReqInsightRepository(jdbc), insightFingerprint),
                mock(AuthProperties.class)
        );
    }

    @Test
    void persistsAiResolutionOnCreateAndFactsUpdate() {
        var created = controller.create(new CreateReqRequest(
                "订单报错", "提交失败", null, null, null, null, null, null, null
        )).getBody();

        assertThat(created).isNotNull();
        assertThat(created.reqType()).isEqualTo("BUG_FIX");
        assertThat(created.reqTypeSource()).isEqualTo("AI");
        assertThat(created.reqTypeConfidence()).isEqualTo(0.75);

        var updated = controller.update(created.id(), new UpdateReqRequest(
                "调整订单", "修改已有流程", null, null, null, null, null, null, null
        ));

        assertThat(updated.reqType()).isEqualTo("MODULE_ADJUST");
        assertThat(updated.reqTypeSource()).isEqualTo("AI");
        assertThat(updated.reqTypeConfidence()).isEqualTo(0.7);
    }

    @Test
    void syncUsesConfirmedPrdTypeWithoutCallingClassifier() {
        jdbc.update("""
                INSERT INTO prd_session (id, title, raw_input, project, module, status, req_type)
                VALUES ('prd-1', '新建看板', '新增交付看板', 'kai-toolbox', 'delivery', 'CLARIFYING', 'NEW_MODULE')
                """);

        Map<String, Object> result = controller.syncFromPrd().getBody();
        Map<String, Object> stored = jdbc.queryForMap("""
                SELECT req_type, req_type_source, req_type_confidence
                FROM req_pool_item WHERE prd_session_id = 'prd-1'
                """);

        assertThat(result).containsEntry("created", 1);
        assertThat(stored.get("req_type")).isEqualTo("NEW_MODULE");
        assertThat(stored.get("req_type_source")).isEqualTo("PRD_SESSION");
        assertThat(((Number) stored.get("req_type_confidence")).doubleValue()).isEqualTo(1);
    }

    @Test
    void syncDoesNotTreatDraftPlaceholderAsConfirmedType() {
        jdbc.update("""
                INSERT INTO prd_session (id, title, raw_input, project, module, status, req_type)
                VALUES ('prd-draft', '草稿', '尚未确认', NULL, NULL, 'DRAFT', 'NEW_MODULE')
                """);

        controller.syncFromPrd();
        Map<String, Object> stored = jdbc.queryForMap("""
                SELECT req_type, req_type_source, req_type_confidence
                FROM req_pool_item WHERE prd_session_id = 'prd-draft'
                """);

        assertThat(stored.get("req_type")).isEqualTo("UNKNOWN");
        assertThat(stored.get("req_type_source")).isEqualTo("UNKNOWN");
        assertThat(((Number) stored.get("req_type_confidence")).doubleValue()).isZero();
    }

    private void createSchema() {
        jdbc.execute("""
                CREATE TABLE req_pool_item (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, project TEXT, module TEXT,
                    priority TEXT NOT NULL, status TEXT NOT NULL, assignee TEXT, assignee_user_id INTEGER,
                    deadline TEXT, prd_session_id TEXT, tags TEXT, req_type TEXT, req_type_source TEXT,
                    req_type_confidence REAL, ai_insight TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                )
                """);
        jdbc.execute("""
                CREATE TABLE req_pool_insight (
                    id TEXT PRIMARY KEY, item_id TEXT NOT NULL, analysis_type TEXT NOT NULL,
                    prompt_version TEXT NOT NULL, source_hash TEXT NOT NULL, portfolio_set_hash TEXT,
                    payload_json TEXT NOT NULL, engine TEXT NOT NULL, model TEXT,
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                )
                """);
        jdbc.execute("""
                CREATE TABLE prd_session (
                    id TEXT PRIMARY KEY, title TEXT, raw_input TEXT, project TEXT, module TEXT,
                    status TEXT, req_type TEXT, parent_id TEXT
                )
                """);
        jdbc.execute("""
                CREATE TABLE req_pool_prd_exclusion (
                    prd_session_id TEXT PRIMARY KEY, excluded_at INTEGER NOT NULL
                )
                """);
    }
}
