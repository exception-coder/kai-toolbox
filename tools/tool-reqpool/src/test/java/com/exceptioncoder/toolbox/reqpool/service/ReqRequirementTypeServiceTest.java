package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolution;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolutionPort;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeSource;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReqRequirementTypeServiceTest {

    @Test
    void appliesResolutionFromSharedPort() {
        RequirementTypeResolutionPort port = mock(RequirementTypeResolutionPort.class);
        when(port.resolveRequirementType("订单异常", "提交后报错", null, null))
                .thenReturn(new RequirementTypeResolution(
                        RequirementType.BUG_FIX,
                        RequirementTypeSource.AI,
                        0.8
                ));
        ReqRequirementTypeService service = serviceWith(port);
        ReqItem item = ReqItem.builder().id("req-1").title("订单异常").description("提交后报错").build();

        service.resolveIndependentItem(item);

        assertThat(item.getReqType()).isEqualTo("BUG_FIX");
        assertThat(item.getReqTypeSource()).isEqualTo("AI");
        assertThat(item.getReqTypeConfidence()).isEqualTo(0.8);
        verify(port).resolveRequirementType("订单异常", "提交后报错", null, null);
    }

    @Test
    void keepsUnknownWhenNoResolutionAdapterIsInstalled() {
        ReqRequirementTypeService service = serviceWith();
        ReqItem item = ReqItem.builder().id("req-2").title("待判定需求").build();

        service.resolveIndependentItem(item);

        assertThat(item.getReqType()).isEqualTo("UNKNOWN");
        assertThat(item.getReqTypeSource()).isEqualTo("UNKNOWN");
        assertThat(item.getReqTypeConfidence()).isZero();
    }

    @Test
    void fallsBackToUnknownWhenResolutionTimesOut() {
        RequirementTypeResolutionPort port = (title, description, project, module) -> {
            try {
                Thread.sleep(2_000);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            return new RequirementTypeResolution(
                    RequirementType.NEW_MODULE,
                    RequirementTypeSource.AI,
                    0.9
            );
        };
        ReqRequirementTypeService service = serviceWithTimeout(1, port);
        ReqItem item = ReqItem.builder().id("req-timeout").title("慢响应需求").build();

        service.resolveIndependentItem(item);

        assertThat(item.getReqType()).isEqualTo("UNKNOWN");
        assertThat(item.getReqTypeSource()).isEqualTo("UNKNOWN");
        assertThat(item.getReqTypeConfidence()).isZero();
    }

    @Test
    void acceptsOnlyConfirmedPrdSessionTypes() {
        ReqRequirementTypeService service = serviceWith();
        ReqItem confirmed = ReqItem.builder().build();
        ReqItem draft = ReqItem.builder().build();

        service.applyPrdSessionType(confirmed, "MODULE_ADJUST");
        service.applyPrdSessionType(draft, null);

        assertThat(confirmed.getReqType()).isEqualTo("MODULE_ADJUST");
        assertThat(confirmed.getReqTypeSource()).isEqualTo("PRD_SESSION");
        assertThat(confirmed.getReqTypeConfidence()).isEqualTo(1);
        assertThat(draft.getReqType()).isEqualTo("UNKNOWN");
        assertThat(draft.getReqTypeSource()).isEqualTo("UNKNOWN");
        assertThat(draft.getReqTypeConfidence()).isZero();
    }

    @SafeVarargs
    private static ReqRequirementTypeService serviceWith(RequirementTypeResolutionPort... ports) {
        return serviceWithTimeout(30, ports);
    }

    @SafeVarargs
    private static ReqRequirementTypeService serviceWithTimeout(
            long timeoutSeconds,
            RequirementTypeResolutionPort... ports
    ) {
        @SuppressWarnings("unchecked")
        ObjectProvider<RequirementTypeResolutionPort> provider = mock(ObjectProvider.class);
        when(provider.orderedStream()).thenAnswer(invocation -> Stream.of(ports));
        return new ReqRequirementTypeService(provider, timeoutSeconds);
    }
}
