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
