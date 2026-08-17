package com.regentech_fashion.supplierquote.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MarketQuoteBusinessStatusTest {

    @Test
    void resolvesTheFiveSupplierFacingStates() {
        assertThat(MarketQuoteBusinessStatus.resolve(false, null, null, false))
                .isEqualTo(MarketQuoteBusinessStatus.PENDING_QUOTE);
        assertThat(MarketQuoteBusinessStatus.resolve(true, 0, null, false))
                .isEqualTo(MarketQuoteBusinessStatus.PENDING_AUDIT);
        assertThat(MarketQuoteBusinessStatus.resolve(true, 1, null, false))
                .isEqualTo(MarketQuoteBusinessStatus.APPROVED);
        assertThat(MarketQuoteBusinessStatus.resolve(true, 2, 2, false))
                .isEqualTo(MarketQuoteBusinessStatus.REJECTED_VOID);
        assertThat(MarketQuoteBusinessStatus.resolve(true, 2, 3, false))
                .isEqualTo(MarketQuoteBusinessStatus.REQUOTE);
        assertThat(MarketQuoteBusinessStatus.resolve(true, 2, 2, true))
                .isEqualTo(MarketQuoteBusinessStatus.REQUOTE);
    }

    @Test
    void onlyPendingQuoteAndRequoteAreEditable() {
        assertThat(MarketQuoteBusinessStatus.PENDING_QUOTE.canQuote()).isTrue();
        assertThat(MarketQuoteBusinessStatus.REQUOTE.canQuote()).isTrue();
        assertThat(MarketQuoteBusinessStatus.REJECTED_VOID.canQuote()).isFalse();
        assertThat(MarketQuoteBusinessStatus.APPROVED.canQuote()).isFalse();
        assertThat(MarketQuoteBusinessStatus.PENDING_AUDIT.canRevoke()).isTrue();
    }
}
