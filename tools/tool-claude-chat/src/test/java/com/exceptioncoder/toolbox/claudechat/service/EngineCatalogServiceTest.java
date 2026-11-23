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

        EngineCatalogService catalog = new EngineCatalogService(sidecar);
        EngineCatalogView result = catalog.list(false);

        assertThat(result.protocolVersion()).isEqualTo(1);
        assertThat(result.engines()).hasSize(1);
        assertThat(result.engines().getFirst().selectable()).isFalse();
        assertThat(result.engines().getFirst().probe().status()).isEqualTo("dependencyMissing");
        assertThat(catalog.creationIssue("deepseekHarness")).contains("DeepSeek Harness", "缺少运行环境");
    }

    @Test
    void returnsExplicitEmptyCatalogWhenSidecarIsUnavailable() {
        SidecarClient sidecar = mock(SidecarClient.class);
        when(sidecar.queryEngineCatalog(anyBoolean(), anyLong())).thenReturn(Optional.empty());

        EngineCatalogService catalog = new EngineCatalogService(sidecar);
        EngineCatalogView result = catalog.list(true);

        assertThat(result.engines()).isEmpty();
        assertThat(result.error()).isEqualTo("Sidecar 引擎目录不可用");
        assertThat(catalog.creationIssue("deepseekHarness")).contains("无法读取 Sidecar 引擎目录");
        assertThat(catalog.creationIssue("codex")).isNull();
    }

    @Test
    void requiresSidecarReadinessForAntigravityAdmission() throws Exception {
        SidecarClient sidecar = mock(SidecarClient.class);
        when(sidecar.queryEngineCatalog(anyBoolean(), anyLong())).thenReturn(Optional.of(mapper.readTree("""
                {"protocolVersion":1,"engines":[{
                  "id":"antigravity","displayName":"Antigravity","capabilities":["resume"],
                  "availability":"stable","selectable":false,
                  "probe":{"status":"incompatible","runtimeVersion":"1.1.1"}
                }]}
                """)));

        assertThat(new EngineCatalogService(sidecar).selectable("antigravity")).isFalse();
    }

    @Test
    void zcodeCannotBypassMissingRuntimeAdmission() {
        SidecarClient sidecar = mock(SidecarClient.class);
        when(sidecar.queryEngineCatalog(anyBoolean(), anyLong())).thenReturn(Optional.empty());
        assertThat(new EngineCatalogService(sidecar).selectable("zcode")).isFalse();
        assertThat(new EngineCatalogService(sidecar).selectable("hermes")).isFalse();
    }
}
