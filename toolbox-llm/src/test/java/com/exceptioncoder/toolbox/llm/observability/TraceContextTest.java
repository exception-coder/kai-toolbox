package com.exceptioncoder.toolbox.llm.observability;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TraceContextTest {

    @Test
    void acceptsValidW3cContextAndExtractsTraceId() {
        TraceContext context = new TraceContext(
                "00-0123456789ABCDEF0123456789ABCDEF-0123456789ABCDEF-01", "vendor=value");

        assertThat(context.valid()).isTrue();
        assertThat(context.traceId()).isEqualTo("0123456789abcdef0123456789abcdef");
        assertThat(context.traceparent()).isLowerCase();
    }

    @Test
    void rejectsZeroAndMalformedIdentifiers() {
        assertThat(new TraceContext("00-00000000000000000000000000000000-0123456789abcdef-01", null).valid())
                .isFalse();
        assertThat(new TraceContext("invalid", null).valid()).isFalse();
        assertThat(TraceContext.empty().traceId()).isNull();
    }
}
