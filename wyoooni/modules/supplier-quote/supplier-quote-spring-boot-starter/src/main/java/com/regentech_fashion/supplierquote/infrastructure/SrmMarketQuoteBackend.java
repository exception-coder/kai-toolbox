package com.regentech_fashion.supplierquote.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteItem;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.domain.MarketQuoteBusinessStatus;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 调用 SRM Open API 的市场报价适配器。 */
public class SrmMarketQuoteBackend implements MarketQuoteBackend {
    private static final String STATUS_PENDING_QUOTE = "PENDING_QUOTE";
    private static final String STATUS_PENDING_AUDIT = "PENDING_AUDIT";
    private static final String STATUS_APPROVED = "APPROVED";
    private static final String STATUS_REJECTED_VOID = "REJECTED_VOID";
    private static final String STATUS_REQUOTE = "REQUOTE";
    private final SupplierQuoteProperties.MarketQuote properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public SrmMarketQuoteBackend(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        this.properties = properties.getMarketQuote();
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(this.properties.getConnectTimeoutMillis()))
                .build();
    }

    @Override
    public MarketQuotePage findPage(BindingView binding, MarketQuoteQuery query) {
        JsonNode page = requestPage(binding.supplierId(), query, null, null);
        List<MarketQuoteItem> items = new ArrayList<>();
        page.path("list").forEach(node -> items.add(toItem(node)));
        long total = page.path("total").asLong(items.size());
        long pendingCount = "PENDING".equals(query.tab())
                ? total
                : requestPage(binding.supplierId(), new MarketQuoteQuery(1, 1, "PENDING", "", ""),
                        null, null).path("total").asLong();
        return new MarketQuotePage(items, total, pendingCount, query.pageNo(), query.pageSize());
    }

    @Override
    public MarketQuoteSubmissionResult submit(BindingView binding, MarketQuotePriceInput input,
                                              String idempotencyKey) {
        MarketQuoteItem owned = requireOwnedItem(binding, input.supcId(), null);
        requireQuotable(owned);
        sendJson("POST", properties.getSubmitPath(), submissionBody(input), idempotencyKey);
        return new MarketQuoteSubmissionResult(List.of(input.supcId()), List.of());
    }

    @Override
    public MarketQuoteSubmissionResult submitBatch(BindingView binding, List<MarketQuotePriceInput> items,
                                                   String idempotencyKey) {
        List<Map<String, Object>> requests = new ArrayList<>(items.size());
        for (MarketQuotePriceInput input : items) {
            requireQuotable(requireOwnedItem(binding, input.supcId(), null));
            requests.add(submissionBody(input));
        }
        sendJson("POST", properties.getBatchSubmitPath(), requests, idempotencyKey);
        return new MarketQuoteSubmissionResult(items.stream().map(MarketQuotePriceInput::supcId).toList(), List.of());
    }

    @Override
    public void revoke(BindingView binding, String supcId) {
        MarketQuoteItem owned = requireOwnedItem(binding, supcId, null);
        if (!owned.canRevoke()) {
            throw conflict("当前报价状态不允许撤销");
        }
        sendJson("PUT", properties.getRevokePath() + "?id=" + encode(supcId), null, null);
    }

    @Override
    public YarnQualityStandards findQualityStandards(BindingView binding, String productId) {
        requireOwnedItem(binding, null, productId);
        JsonNode data = sendJson("GET", properties.getQualityStandardsPath()
                + "?productId=" + encode(productId), null, null);
        JsonNode standard = data.isArray() && !data.isEmpty() ? data.get(0) : data;
        if (standard == null || standard.isMissingNode() || standard.isNull()) {
            throw notFound("当前产品没有配置质量标准");
        }
        return new YarnQualityStandards(
                metric(standard, "twist", " T/10cm"),
                metric(standard, "twistCV", "%"),
                metric(standard, "strongCn", " Cn"),
                metric(standard, "strongCV", "%"),
                metric(standard, "evennessmust", "%"),
                metric(standard, "culars", " 个/km"),
                metric(standard, "slub", " 个/km"),
                metric(standard, "nepsmust", " 个/km"),
                metric(standard, "hairiness", ""),
                metric(standard, "heterocele", " 根"));
    }

    private MarketQuoteItem requireOwnedItem(BindingView binding, String supcId, String productId) {
        JsonNode page = requestPage(binding.supplierId(), new MarketQuoteQuery(1, 2, "ALL", "", ""),
                supcId, productId);
        if (page.path("total").asLong() != 1 || page.path("list").size() != 1) {
            throw notFound("没有找到当前供应商可访问的报价记录");
        }
        return toItem(page.path("list").get(0));
    }

    private JsonNode requestPage(String supplierId, MarketQuoteQuery query, String supcId, String productId) {
        Map<String, String> parameters = new LinkedHashMap<>();
        parameters.put("pageNo", Integer.toString(query.pageNo()));
        parameters.put("pageSize", Integer.toString(query.pageSize()));
        parameters.put("supId", requireNumericId(supplierId, "供应商"));
        parameters.put("haveTask", "PENDING".equals(query.tab()) ? "1" : "0");
        putIfPresent(parameters, "productName", query.productName());
        putIfPresent(parameters, "status", srmStatus(query.status()));
        putIfPresent(parameters, "supcIds", supcId);
        putIfPresent(parameters, "productId", productId);
        return sendJson("GET", properties.getListPath() + "?" + queryString(parameters), null, null);
    }

    private JsonNode sendJson(String method, String path, Object body, String idempotencyKey) {
        validateConfiguration();
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(endpoint(path))
                    .timeout(Duration.ofMillis(properties.getRequestTimeoutMillis()))
                    .header("Accept", "application/json")
                    .header("secretkey", properties.getSecretKey());
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                request.header("Idempotency-Key", idempotencyKey);
            }
            if (body == null) {
                request.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                request.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
            }
            HttpResponse<String> response = httpClient.send(request.build(), HttpResponse.BodyHandlers.ofString());
            return parseResponse(response);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable("市场报价服务调用被中断");
        } catch (SupplierQuoteApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable("暂时无法连接 SRM 市场报价服务");
        }
    }

    private JsonNode parseResponse(HttpResponse<String> response) throws Exception {
        JsonNode json = objectMapper.readTree(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw unavailable(json.path("msg").asText("SRM 市场报价服务响应异常"));
        }
        int code = json.path("code").asInt(0);
        if (code != 0) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "SRM_MARKET_QUOTE_REJECTED",
                    json.path("msg").asText("SRM 拒绝了市场报价操作"));
        }
        return json.has("data") ? json.path("data") : json;
    }

    private Map<String, Object> submissionBody(MarketQuotePriceInput input) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("supcId", Long.valueOf(requireNumericId(input.supcId(), "报价记录")));
        body.put("price", new BigDecimal(input.priceExcludeTax()));
        body.put("priceIsTax", 0);
        body.put("priceIncludeTax", new BigDecimal(input.priceIncludeTax()));
        body.put("priceExcludeTax", new BigDecimal(input.priceExcludeTax()));
        return body;
    }

    private static MarketQuoteItem toItem(JsonNode node) {
        JsonNode price = node.path("priceRespVO");
        boolean haveTask = node.path("haveTask").asInt(0) == 1;
        MarketQuoteBusinessStatus status = status(price, haveTask);
        return new MarketQuoteItem(
                node.path("id").asText(), node.path("productId").asText(),
                node.path("productCode").asText(), node.path("productName").asText(),
                node.path("procolorCode").asText(), node.path("procolorName").asText(),
                node.path("procolorLevelsStr").asText(""), nullableText(node, "procolorCertificate"),
                nullableText(price, "supplierLatestQuoteDate", "createTime"),
                nullableDecimal(price, "priceIncludingTax", "priceIncludeTax"),
                nullableDecimal(price, "priceExcludeTax"), status.name(),
                nullableText(price, "rejectReason"), haveTask,
                status.canQuote(), status.canRevoke());
    }

    private static MarketQuoteBusinessStatus status(JsonNode price, boolean haveTask) {
        boolean quoteExists = !price.isMissingNode() && !price.isNull() && price.hasNonNull("status");
        Integer status = quoteExists ? price.path("status").asInt(-1) : null;
        Integer auditResult = quoteExists && price.hasNonNull("auditResult")
                ? price.path("auditResult").asInt() : null;
        return MarketQuoteBusinessStatus.resolve(quoteExists, status, auditResult, haveTask);
    }

    private static String srmStatus(String status) {
        if (status == null || status.isBlank() || STATUS_PENDING_QUOTE.equals(status)) {
            return null;
        }
        if (STATUS_PENDING_AUDIT.equals(status)) {
            return "0";
        }
        if (STATUS_APPROVED.equals(status)) {
            return "1";
        }
        if (Set.of(STATUS_REJECTED_VOID, STATUS_REQUOTE).contains(status)) {
            return "2";
        }
        throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "MARKET_QUOTE_STATUS_INVALID", "报价状态不正确");
    }

    private void validateConfiguration() {
        if (properties.getBaseUrl() == null || properties.getBaseUrl().isBlank()
                || properties.getSecretKey() == null || properties.getSecretKey().isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "SRM_MARKET_QUOTE_NOT_CONFIGURED", "SRM 市场报价服务尚未配置");
        }
    }

    private URI endpoint(String path) {
        String baseUrl = properties.getBaseUrl().replaceAll("/+$", "");
        return URI.create(baseUrl + (path.startsWith("/") ? path : "/" + path));
    }

    private static String queryString(Map<String, String> parameters) {
        return parameters.entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(java.util.stream.Collectors.joining("&"));
    }

    private static void putIfPresent(Map<String, String> parameters, String key, String value) {
        if (value != null && !value.isBlank()) {
            parameters.put(key, value);
        }
    }

    private static String requireNumericId(String value, String label) {
        try {
            return Long.toString(Long.parseLong(value));
        } catch (NumberFormatException exception) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST,
                    "MARKET_QUOTE_ID_INVALID", label + "ID格式不正确");
        }
    }

    private static String nullableText(JsonNode node, String... fields) {
        for (String field : fields) {
            if (node.hasNonNull(field) && !node.path(field).asText().isBlank()) {
                return node.path(field).asText();
            }
        }
        return null;
    }

    private static String nullableDecimal(JsonNode node, String... fields) {
        String value = nullableText(node, fields);
        return value == null ? null : new BigDecimal(value).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String metric(JsonNode node, String field, String unit) {
        String value = nullableText(node, field);
        return value == null ? "—" : value + unit;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static void requireQuotable(MarketQuoteItem item) {
        if (!item.canQuote()) {
            throw conflict("当前报价记录不允许提交");
        }
    }

    private static SupplierQuoteApiException notFound(String message) {
        return new SupplierQuoteApiException(HttpStatus.NOT_FOUND, "MARKET_QUOTE_NOT_FOUND", message);
    }

    private static SupplierQuoteApiException conflict(String message) {
        return new SupplierQuoteApiException(HttpStatus.CONFLICT, "MARKET_QUOTE_STATE_CONFLICT", message);
    }

    private static SupplierQuoteApiException unavailable(String message) {
        return new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "SRM_MARKET_QUOTE_UNAVAILABLE", message);
    }
}
