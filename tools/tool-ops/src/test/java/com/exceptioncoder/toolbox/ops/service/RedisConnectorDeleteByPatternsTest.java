package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.RedisKeyDeleteResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.junit.jupiter.api.Test;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.params.ScanParams;
import redis.clients.jedis.resps.ScanResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisConnectorDeleteByPatternsTest {

    @Test
    void scansAndDeletesMatchingKeysInOneBatch() {
        OpsDataSourcePool pool = mock(OpsDataSourcePool.class);
        Jedis jedis = mock(Jedis.class);
        OpsDatasource datasource = OpsDatasource.builder()
                .id("srm-redis-dev")
                .type(DatasourceType.REDIS)
                .build();
        when(pool.borrowRedis(datasource)).thenReturn(jedis);
        when(jedis.scan(eq("0"), any(ScanParams.class)))
                .thenReturn(new ScanResult<>("0", List.of("system_menu:2881", "system_menu:2724")));
        when(jedis.del("system_menu:2881", "system_menu:2724")).thenReturn(2L);

        RedisKeyDeleteResult result = new RedisConnector(pool)
                .deleteByPatterns(datasource, List.of("system_menu:*"));

        assertThat(result.totalDeleted()).isEqualTo(2);
        assertThat(result.patterns()).singleElement().satisfies(pattern -> {
            assertThat(pattern.pattern()).isEqualTo("system_menu:*");
            assertThat(pattern.deleted()).isEqualTo(2);
        });
        verify(jedis).del("system_menu:2881", "system_menu:2724");
    }
}

