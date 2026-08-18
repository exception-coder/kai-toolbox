package com.regentech_fashion.supplierquote.infrastructure.srm;

import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuoteCycleEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuotePriceEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteCycleRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuotePriceRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteTaskRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.YarnQualityStandardRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** MySQL 报价事务编排回归测试。 */
class JpaMarketQuoteBackendTest {
    private final MarketQuoteCycleRepository cycles = mock(MarketQuoteCycleRepository.class);
    private final MarketQuotePriceRepository prices = mock(MarketQuotePriceRepository.class);
    private final MarketQuoteTaskRepository tasks = mock(MarketQuoteTaskRepository.class);
    private final YarnQualityStandardRepository standards = mock(YarnQualityStandardRepository.class);
    private JpaMarketQuoteBackend backend;

    @BeforeEach
    void setUp() {
        backend = new JpaMarketQuoteBackend(cycles, prices, tasks, standards);
    }

    @Test
    void submitCopiesCycleSnapshotAndCompletesOnlyCurrentSupplierTask() {
        MarketQuoteCycleEntity cycle = cycle();
        when(cycles.findByIdAndSupplierIdAndDeletedFalse(82031L, 8658L)).thenReturn(Optional.of(cycle));
        when(tasks.findPendingCycleIds(8658L)).thenReturn(List.of(82031L));
        when(prices.saveAndFlush(any())).thenAnswer(invocation -> {
            MarketQuotePriceEntity saved = invocation.getArgument(0);
            saved.setId(99001L);
            return saved;
        });

        var result = backend.submit(binding(), new MarketQuotePriceInput("82031", "104.00", "100.00"), "idem-1");

        assertThat(result.succeededIds()).containsExactly("82031");
        assertThat(cycle.getPriceId()).isEqualTo(99001L);
        assertThat(cycle.getPriceStatus()).isZero();
        verify(tasks).complete(82031L, 8658L, "scm-user");
        verify(cycles).save(cycle);
    }

    @Test
    void revokeRestoresPreviousQuoteInsteadOfClearingHistory() {
        MarketQuoteCycleEntity cycle = cycle();
        cycle.setPriceId(99002L);
        cycle.setPriceStatus(0);
        MarketQuotePriceEntity current = price(99002L, 0);
        MarketQuotePriceEntity previous = price(99001L, 1);
        when(cycles.findByIdAndSupplierIdAndDeletedFalse(82031L, 8658L)).thenReturn(Optional.of(cycle));
        when(prices.findByCycleIdAndDeletedFalseOrderByIdDesc(82031L))
                .thenReturn(List.of(current, previous));
        when(tasks.reopen(82031L, 8658L, "scm-user")).thenReturn(1);

        backend.revoke(binding(), "82031");

        assertThat(current.getDeleted()).isTrue();
        assertThat(cycle.getPriceId()).isEqualTo(99001L);
        assertThat(cycle.getPriceStatus()).isEqualTo(1);
        verify(prices).save(current);
        verify(tasks).reopen(82031L, 8658L, "scm-user");
        verify(cycles).save(cycle);
    }

    @Test
    void pageUsesBusinessStatusAggregateInsteadOfRawActiveTaskRows() {
        when(tasks.findPendingCycleIds(8658L)).thenReturn(List.of(82031L, 82031L));
        when(tasks.countQuotableCycles(8658L)).thenReturn(0L);
        when(cycles.findAll(any(Specification.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        var page = backend.findPage(binding(), new MarketQuoteQuery(1, 50, "ALL", "", ""));

        assertThat(page.pendingCount()).isZero();
        verify(tasks).countQuotableCycles(8658L);
        verify(cycles).findAll(any(Specification.class), any(org.springframework.data.domain.Pageable.class));
    }

    private static BindingView binding() {
        return new BindingView("scm-user", "supplier", "供应商", "8658", "测试供应商", "ERP");
    }

    private static MarketQuoteCycleEntity cycle() {
        MarketQuoteCycleEntity cycle = new MarketQuoteCycleEntity();
        cycle.setId(82031L);
        cycle.setProductId(1001L);
        cycle.setProductCode("YARN-1001");
        cycle.setProductName("40S 精梳棉");
        cycle.setColorId(2001L);
        cycle.setColorCode("RAW");
        cycle.setColorName("本白");
        cycle.setColorGrade(1);
        cycle.setSupplierId(8658L);
        cycle.setSupplierName("测试供应商");
        cycle.setDeleted(false);
        return cycle;
    }

    private static MarketQuotePriceEntity price(Long id, Integer status) {
        MarketQuotePriceEntity price = new MarketQuotePriceEntity();
        price.setId(id);
        price.setCycleId(82031L);
        price.setStatus(status);
        price.setPriceIsTax(0);
        price.setCreateTime(LocalDateTime.of(2026, 8, 16, 12, 0));
        price.setDeleted(false);
        return price;
    }
}
