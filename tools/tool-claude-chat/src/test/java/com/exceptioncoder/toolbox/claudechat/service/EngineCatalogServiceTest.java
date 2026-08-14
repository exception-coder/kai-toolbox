package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineCatalogView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EngineCatalogServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void preservesSidecarReadinessAndProbeDetails() throws Exception {
        SidecarClient sidecar = mock(SidecarClient.class);
        when(sidecar.queryEngineCatalog(anyBoolean(), anyLong())).thenReturn(Optional.of(mapper.readTree("""
                {
                  "protocolVersion": 1,
                  "engines": [
                    {
                      "id": "deepseekHarness",
                      "displayName": "DeepSeek Harness",
                      "capabilities": ["resume", "interrupt"],
                      "availability": "experimental",
                      "selectable": false,
                      "probe": {
                        "status": "dependencyMissing",
                        "sdkVersion": "0.1.0-rc.6",
                        "detail": "runtime command not found"
                      }
                    }
                  ]
                }
                """)));

        EngineCatalogView result = new EngineCatalogService(sidecar).list(false);

        assertThat(result.protocolVersion()).isEqualTo(1);
        assertThat(result.engines()).hasSize(1);
        assertThat(result.engines().getFirst().selectable()).isFalse();
        assertThat(result.engines().getFirst().probe().status()).isEqualTo("dependencyMissing");
    }

    @Test
    void returnsExplicitEmptyCatalogWhenSidecarIsUnavailable() {
        SidecarClient sidecar = mock(SidecarClient.class);
        when(sidecar.queryEngineCatalog(anyBoolean(), anyLong())).thenReturn(Optional.empty());

        EngineCatalogView result = new EngineCatalogService(sidecar).list(true);

        assertThat(result.engines()).isEmpty();
        assertThat(result.error()).isEqualTo("Sidecar 引擎目录不可用");
    }
}
