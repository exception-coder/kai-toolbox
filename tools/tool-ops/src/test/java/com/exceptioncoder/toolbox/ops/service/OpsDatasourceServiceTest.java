package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.DatasourceRequest;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpsDatasourceServiceTest {
    @Test
    void savingPublishesNewConfigurationAndKeepsBlankPasswordWithoutGoingBackwardsInRevision() {
        var repository = mock(DatasourceRepository.class);
        var pool = mock(OpsDataSourcePool.class);
        long previous = System.currentTimeMillis() + 60_000;
        var existing = OpsDatasource.builder().id("db").type(DatasourceType.ORACLE).password("kept")
                .updatedAt(previous).build();
        when(repository.findById("db")).thenReturn(Optional.of(existing));
        var service = new OpsDatasourceService(repository, mock(QueryHistoryRepository.class), pool);
        service.update("db", new DatasourceRequest("system", "DEV", "ORACLE", "name", "localhost", 1521,
                "user", "", "test", null, null, 0));
        assertThat(existing.getPassword()).isEqualTo("kept");
        assertThat(existing.getUpdatedAt()).isGreaterThan(previous);
        verify(repository).update(existing);
        verify(pool).reconfigure(existing);
        verify(pool, never()).invalidate("db");
    }
}
