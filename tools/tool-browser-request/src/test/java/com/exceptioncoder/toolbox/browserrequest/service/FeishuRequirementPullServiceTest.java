package com.exceptioncoder.toolbox.browserrequest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FeishuRequirementPullServiceTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final FeishuRequirementPullService service =
            new FeishuRequirementPullService(null, OBJECT_MAPPER);

    @Test
    void extractsOfficialRecordShape() {
        String response = """
                {
                  "code": 0,
                  "data": {
                    "items": [{
                      "record_id": "rec001",
                      "fields": {
                        "需求标题": "新增采购审批",
                        "优先级": "高",
                        "说明": [{"text": "支持会签"}, {"text": "保留审批记录"}]
                      }
                    }]
                  }
                }
                """;

        var rows = service.extractRows(List.of(response));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().recordId()).isEqualTo("rec001");
        assertThat(rows.getFirst().title()).isEqualTo("新增采购审批");
        assertThat(rows.getFirst().fields())
                .containsEntry("优先级", "高")
                .containsEntry("说明", "支持会签；保留审批记录");
    }

    @Test
    void resolvesInternalFieldIdsWithMetadata() {
        String metadata = """
                {"fields":[
                  {"fieldId":"fldTitle","fieldName":"需求名称"},
                  {"fieldId":"fldOwner","fieldName":"负责人"}
                ]}
                """;
        String records = """
                {"records":[{
                  "recordId":"rec002",
                  "fieldValues":{"fldTitle":"库存预警","fldOwner":{"name":"张三"}}
                }]}
                """;

        var rows = service.extractRows(List.of(metadata, records));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().title()).isEqualTo("库存预警");
        assertThat(rows.getFirst().fields()).containsEntry("负责人", "张三");
    }

    @Test
    void decodesWebBitableBase64GzipRecordMap() throws Exception {
        String payload = """
                {
                  "recordMap": {
                    "recCompressed001": {
                      "fldTitle": {"value": "采购单自动催办", "modifiedTime": 123},
                      "fldPriority": {"value": {"name": "高"}}
                    }
                  }
                }
                """;
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
            gzip.write(payload.getBytes(StandardCharsets.UTF_8));
        }
        String response = """
                {"code":0,"data":{"encoding":0,"records":"%s"}}
                """.formatted(Base64.getEncoder().encodeToString(compressed.toByteArray()));
        String metadata = """
                {"fields":[
                  {"fieldId":"fldTitle","fieldName":"需求标题"},
                  {"fieldId":"fldPriority","fieldName":"优先级"}
                ]}
                """;

        var rows = service.extractRows(List.of(response, metadata));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().recordId()).isEqualTo("recCompressed001");
        assertThat(rows.getFirst().title()).isEqualTo("采购单自动催办");
        assertThat(rows.getFirst().fields())
                .containsEntry("需求标题", "采购单自动催办")
                .containsEntry("优先级", "高");
    }

    @Test
    void mapsKnownRequirementFieldIdsWithoutClientvarsMetadata() throws Exception {
        String payload = """
                {
                  "recordMap": {
                    "recKnownFields": {
                      "fld4EZgUc8": {"value": [{"text": "付款流程优化"}]},
                      "fld4MyICot": {"value": [{"text": "增加批量审批能力"}]},
                      "fld2JgJuVL": {"value": "optki0Xnkb"},
                      "fld6iE5Iix": {"value": [{"text": "财务部"}]}
                    }
                  }
                }
                """;
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
            gzip.write(payload.getBytes(StandardCharsets.UTF_8));
        }
        String response = """
                {"code":0,"data":{"encoding":0,"records":"%s"}}
                """.formatted(Base64.getEncoder().encodeToString(compressed.toByteArray()));

        var rows = service.extractRows(List.of(response));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().title()).isEqualTo("付款流程优化");
        assertThat(rows.getFirst().fields())
                .containsEntry("需求详情", "增加批量审批能力")
                .containsEntry("需求类型", "功能优化")
                .containsEntry("发起部门", "财务部");
    }

    @Test
    void onlyAcceptsFeishuBitableLinks() {
        assertThat(FeishuRequirementPullService.validateUrl(
                "https://tenant.feishu.cn/wiki/token?table=tbl123&view=vew123"))
                .contains("table=tbl123");

        assertThatThrownBy(() -> FeishuRequirementPullService.validateUrl(
                "https://example.com/wiki/token?table=tbl123"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("feishu.cn");
        assertThatThrownBy(() -> FeishuRequirementPullService.validateUrl(
                "https://tenant.feishu.cn/wiki/token"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("table");
    }

    @Test
    @SuppressWarnings("unchecked")
    void pullsAllPagesDirectlyWithCookieAndRemovesStaleTableRevision() throws Exception {
        HttpClient httpClient = mock(HttpClient.class);
        HttpResponse<String> firstResponse = mock(HttpResponse.class);
        HttpResponse<String> secondResponse = mock(HttpResponse.class);
        when(firstResponse.statusCode()).thenReturn(200);
        when(secondResponse.statusCode()).thenReturn(200);
        when(firstResponse.body()).thenReturn(compressedRecordsEnvelope(3_001, 0, 3_000));
        when(secondResponse.body()).thenReturn(compressedRecordsEnvelope(3_001, 3_000, 1));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(firstResponse, secondResponse);

        FeishuRequirementPullService directService =
                new FeishuRequirementPullService(null, OBJECT_MAPPER, httpClient);
        var result = directService.pull(
                "https://tenant.feishu.cn/wiki/wikiToken?table=tblRequirement&view=vewMain",
                "session=secret",
                "https://tenant.feishu.cn/space/api/v1/bitable/appToken123/records"
                        + "?tableId=tblRequirement&viewId=vewMain&tableRev=741&offset=42&limit=3000");

        assertThat(result.syncMode()).isEqualTo("COOKIE_DIRECT");
        assertThat(result.appToken()).isEqualTo("appToken123");
        assertThat(result.tableId()).isEqualTo("tblRequirement");
        assertThat(result.viewId()).isEqualTo("vewMain");
        assertThat(result.pageCount()).isEqualTo(2);
        assertThat(result.count()).isEqualTo(3_001);
        assertThat(result.records().getFirst().title()).isEqualTo("Requirement 0");
        assertThat(result.records().getLast().title()).isEqualTo("Requirement 3000");

        ArgumentCaptor<HttpRequest> requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, times(2))
                .send(requests.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(requests.getAllValues().get(0).uri().getQuery())
                .contains("offset=0", "limit=3000")
                .doesNotContain("tableRev");
        assertThat(requests.getAllValues().get(1).uri().getQuery())
                .contains("offset=3000", "limit=3000");
        assertThat(requests.getAllValues().get(0).headers().firstValue("Cookie"))
                .contains("session=secret");
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportsExpiredCookieFromDirectEndpoint() throws Exception {
        HttpClient httpClient = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"code\":5,\"msg\":\"Login Required\",\"data\":{}}");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);

        FeishuRequirementPullService directService =
                new FeishuRequirementPullService(null, OBJECT_MAPPER, httpClient);

        assertThatThrownBy(() -> directService.pull(
                "https://tenant.feishu.cn/wiki/wikiToken?table=tblRequirement&view=vewMain",
                "session=expired",
                "https://tenant.feishu.cn/space/api/v1/bitable/appToken123/records"
                        + "?tableId=tblRequirement&viewId=vewMain"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Cookie");
    }

    @Test
    void refusesToForwardCookieToAnotherFeishuTenant() {
        assertThatThrownBy(() -> FeishuRequirementPullService.validateRecordsUrl(
                "https://tenant-a.feishu.cn/wiki/wikiToken?table=tblRequirement",
                "https://tenant-b.feishu.cn/space/api/v1/bitable/appToken123/records"
                        + "?tableId=tblRequirement"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("同一站点");
    }

    private static String compressedRecordsEnvelope(int total, int start, int count) throws Exception {
        ObjectNode payload = OBJECT_MAPPER.createObjectNode();
        payload.put("tableRecordNum", total);
        ObjectNode recordMap = payload.putObject("recordMap");
        for (int index = start; index < start + count; index++) {
            recordMap.putObject("rec" + index)
                    .putObject("fld4EZgUc8")
                    .put("value", "Requirement " + index);
        }
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
            gzip.write(OBJECT_MAPPER.writeValueAsBytes(payload));
        }
        ObjectNode envelope = OBJECT_MAPPER.createObjectNode();
        envelope.put("code", 0);
        envelope.putObject("data")
                .put("encoding", 0)
                .put("records", Base64.getEncoder().encodeToString(compressed.toByteArray()));
        return OBJECT_MAPPER.writeValueAsString(envelope);
    }
}
