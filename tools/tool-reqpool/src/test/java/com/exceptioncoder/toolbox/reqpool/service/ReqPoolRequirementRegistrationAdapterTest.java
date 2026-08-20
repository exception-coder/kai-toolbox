package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReqPoolRequirementRegistrationAdapterTest {

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
