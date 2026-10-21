package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.*;

class ReqPoolRequirementRegistrationAdapterTest {

    @org.junit.jupiter.api.io.TempDir java.nio.file.Path directory;

    @Test
    void terminalRequirementsCannotBeRevivedByBackgroundProgress() {
        var jdbc = new org.springframework.jdbc.core.JdbcTemplate(new org.springframework.jdbc.datasource.DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("progress.db")));
        jdbc.execute("CREATE TABLE req_pool_item(id TEXT PRIMARY KEY,status TEXT,updated_at INTEGER)");
        jdbc.update("INSERT INTO req_pool_item(id,status,updated_at) VALUES ('done','DONE',0),('cancelled','CANCELLED',0),('queued','PENDING_EXECUTION',0)");
        var repository = new ReqItemRepository(jdbc);
        assertThat(repository.updateImplementationStatus("done", "IN_DEV")).isFalse();
        assertThat(repository.updateImplementationStatus("cancelled", "READY_FOR_RELEASE")).isFalse();
        assertThat(repository.updateImplementationStatus("queued", "IN_DEV")).isTrue();
        assertThat(repository.updateImplementationStatus("queued", "READY_FOR_RELEASE")).isTrue();
        assertThat(jdbc.queryForObject("SELECT status FROM req_pool_item WHERE id='queued'", String.class)).isEqualTo("READY_FOR_RELEASE");
    }

    @Test
    void progressOnlyUpdatesMatchingSourceAndNeverCompletesARelease() {
        var repository = mock(ReqItemRepository.class);
        var adapter = new ReqPoolRequirementRegistrationAdapter(repository);
        var command = new RequirementRegistrationCommand("咨询改进", "描述", "kai-toolbox", "fore-consult", null);
        String task = adapter.registerPendingExecutionOnce("consult-suggestion:sample", command);
        when(repository.updateImplementationStatus(anyString(), anyString())).thenReturn(true);
        adapter.updateImplementationStatus("consult-suggestion:sample", task, com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort.ImplementationStatus.IN_DEV);
        adapter.updateImplementationStatus("consult-suggestion:sample", task, com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort.ImplementationStatus.READY_FOR_RELEASE);
        verify(repository).updateImplementationStatus(task, "IN_DEV"); verify(repository).updateImplementationStatus(task, "READY_FOR_RELEASE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> adapter.updateImplementationStatus("wrong-source", task,
                com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort.ImplementationStatus.READY_FOR_RELEASE)).hasMessageContaining("来源");
    }

    @Test
    void sameSourceReusesTaskAndDifferentSourceHasDifferentIdentity() {
        ReqItemRepository repository = mock(ReqItemRepository.class);
        var stored = new java.util.HashMap<String, ReqItem>();
        when(repository.findById(anyString())).thenAnswer(call -> java.util.Optional.ofNullable(stored.get(call.getArgument(0))));
        doAnswer(call -> { ReqItem item = call.getArgument(0); stored.put(item.getId(), item); return null; }).when(repository).insert(any());
        var adapter = new ReqPoolRequirementRegistrationAdapter(repository);
        var command = new RequirementRegistrationCommand("咨询阅读", "简化阅读", "kai-toolbox", "fore-consult", null);
        String first = adapter.registerPendingExecutionOnce("consult-suggestion:one", command);
        assertThat(adapter.registerPendingExecutionOnce("consult-suggestion:one", command)).isEqualTo(first);
        assertThat(adapter.registerPendingExecutionOnce("consult-suggestion:two", command)).isNotEqualTo(first);
        assertThat(stored).hasSize(2);
        verify(repository, times(2)).insert(any());
    }

    @Test
    void confirmedAssistantDraftStartsAsPendingExecution() {
        ReqItemRepository repository = mock(ReqItemRepository.class);
        ReqPoolRequirementRegistrationAdapter adapter = new ReqPoolRequirementRegistrationAdapter(repository);

        adapter.registerPendingExecution(new RequirementRegistrationCommand(
                "审核失败", "订单审核返回 500", "ERP", "order-detail", 9L));

        ArgumentCaptor<ReqItem> item = ArgumentCaptor.forClass(ReqItem.class);
        verify(repository).insert(item.capture());
        assertThat(item.getValue().getStatus()).isEqualTo("PENDING_EXECUTION");
        assertThat(item.getValue().getAssigneeUserId()).isEqualTo(9L);
    }
}
