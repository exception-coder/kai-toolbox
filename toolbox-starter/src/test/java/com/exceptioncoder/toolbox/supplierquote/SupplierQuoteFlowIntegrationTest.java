package com.exceptioncoder.toolbox.supplierquote;

import com.exceptioncoder.toolbox.supplierquote.config.SupplierQuoteWechatForgeProperties;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteItem;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(
        classes = SupplierQuoteFlowIntegrationTest.TestApplication.class,
        properties = {
                "toolbox.sqlite.file=target/supplier-quote-flow-test.db",
                "regentech.supplier-quote.local-storage.enabled=true",
                "regentech.supplier-quote.wechat.mode=mock",
                "regentech.supplier-quote.wechat.secure-cookie=false",
                "regentech.supplier-quote.wechat.local-development-enabled=true",
                "regentech.supplier-quote.account.mode=mock",
                "spring.autoconfigure.exclude="
                        + "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,"
                        + "org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration"
        })
@AutoConfigureMockMvc
class SupplierQuoteFlowIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SupplierQuoteWechatForgeProperties wechatConfigCatalog;
    @Autowired RefreshableConfigRegistry configRegistry;
    @Autowired DynamicConfigService dynamicConfigService;
    @Autowired SupplierQuoteProperties supplierQuoteProperties;

    @BeforeEach
    void clearSupplierQuoteState() {
        jdbc.update("DELETE FROM supplier_quote_submission");
        jdbc.update("DELETE FROM supplier_quote_draft");
        jdbc.update("DELETE FROM supplier_quote_scm_binding");
        jdbc.update("DELETE FROM supplier_quote_wechat_session");
        jdbc.update("DELETE FROM supplier_quote_oauth_state");
    }

    @Test
    void servesWechatDomainVerificationFileFromSiteRoot() throws Exception {
        mvc.perform(get("/MP_verify_eQMZqv1CWST9uWxh.txt"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("eQMZqv1CWST9uWxh"));
    }

    @Test
    void completesWechatBindingAndQuotationFlow() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals(
                "https://kai-tool.exception-coder.com/api/supplier-quote/public/wechat/oauth/callback",
                wechatConfigCatalog.getCallbackUrl());
        org.junit.jupiter.api.Assertions.assertTrue(
                configRegistry.find("regentech.supplier-quote.wechat").isPresent());
        org.junit.jupiter.api.Assertions.assertTrue(
                dynamicConfigService.view("regentech.supplier-quote.wechat").entries().stream()
                .anyMatch(entry -> entry.key().equals("regentech.supplier-quote.wechat.app-secret")));
        dynamicConfigService.applyOverrides("regentech.supplier-quote.wechat",
                Map.of("regentech.supplier-quote.wechat.mock-openid", "forge-refresh-openid"), List.of());
        org.junit.jupiter.api.Assertions.assertEquals(
                "forge-refresh-openid", supplierQuoteProperties.getWechat().getMockOpenid());
        dynamicConfigService.reset("regentech.supplier-quote.wechat");
        String returnTo = "/showcase/supplier-quote/q/demo-quote";
        mvc.perform(get("/api/supplier-quote/public/wechat/session")
                        .with(request -> {
                            request.setServerName("kai-tool.exception-coder.com");
                            return request;
                        })
                        .param("returnTo", returnTo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false))
                .andExpect(jsonPath("$.authorizeUrl").isNotEmpty());

        String setCookie = mvc.perform(get("/api/supplier-quote/public/wechat/oauth/authorize")
                        .param("returnTo", returnTo))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", returnTo))
                .andReturn().getResponse().getHeader("Set-Cookie");
        Cookie sessionCookie = new Cookie("SQ_SESSION", cookieValue(setCookie));

        mvc.perform(get("/api/supplier-quote/public/wechat/session")
                        .param("returnTo", returnTo).cookie(sessionCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.bound").value(false));

        mvc.perform(post("/api/supplier-quote/public/account-bindings").cookie(sessionCookie)
                        .contentType("application/json")
                        .content("""
                                {"username":"supplier-demo","password":"123456",
                                 "returnTo":"/showcase/supplier-quote/q/demo-quote"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.binding.accountId").value("demo-account-001"))
                .andExpect(jsonPath("$.binding.sourceSystem").value("DEMO"));

        mvc.perform(get("/api/supplier-quote/public/quotation-access/demo-quote").cookie(sessionCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestNo").value("XJ20260815018"))
                .andExpect(jsonPath("$.supplierName").value("广州睿程服饰有限公司"));

        mvc.perform(post("/api/supplier-quote/public/quotation-access/demo-quote/submit")
                        .cookie(sessionCookie).header("Idempotency-Key", "integration-submit-1")
                        .contentType("application/json")
                        .content("""
                                {"items":[
                                  {"itemId":"item_01","unitPrice":"18.6000","taxRate":"13","deliveryDays":12,"moq":"1000","remark":"含运费"},
                                  {"itemId":"item_02","unitPrice":"16.8000","taxRate":"13","deliveryDays":10,"moq":"800","remark":"现货坯布"}
                                ],"overallRemark":"价格有效期七天","draftVersion":0,"confirmed":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestNo").value("XJ20260815018"))
                .andExpect(jsonPath("$.erpSyncStatus").value("PENDING"));
    }

    @Test
    void createsLocalDevelopmentSessionWithoutWechatOauth() throws Exception {
        String returnTo = "/showcase/supplier-quote/market-quotes";
        String setCookie = mvc.perform(get("/api/supplier-quote/public/wechat/session")
                        .with(request -> {
                            request.setServerName("192.168.1.20");
                            return request;
                        })
                        .param("returnTo", returnTo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.bound").value(false))
                .andExpect(header().exists("Set-Cookie"))
                .andReturn().getResponse().getHeader("Set-Cookie");
        Cookie sessionCookie = new Cookie("SQ_SESSION", cookieValue(setCookie));

        mvc.perform(post("/api/supplier-quote/public/account-bindings").cookie(sessionCookie)
                        .contentType("application/json")
                        .content("""
                                {"username":"supplier-demo","password":"123456",
                                 "returnTo":"/showcase/supplier-quote/market-quotes"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.returnTo").value(returnTo));
    }

    @Test
    void servesMarketQuoteThroughAuthenticatedBackendContract() throws Exception {
        Cookie sessionCookie = localSessionCookie("127.0.0.1");
        mvc.perform(post("/api/supplier-quote/public/account-bindings").cookie(sessionCookie)
                        .contentType("application/json")
                        .content("""
                                {"username":"supplier-demo","password":"123456",
                                 "returnTo":"/showcase/supplier-quote/market-quotes"}
                                """))
                .andExpect(status().isOk());

        mvc.perform(get("/api/supplier-quote/admin/h5/market-price-quotes")
                        .cookie(sessionCookie).param("tab", "PENDING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].supcId").value("82031"))
                .andExpect(jsonPath("$.pendingCount").value(1));

        mvc.perform(post("/api/supplier-quote/admin/h5/market-price-quotes/82031/submit")
                        .cookie(sessionCookie).header("Idempotency-Key", "market-submit-1")
                        .contentType("application/json")
                        .content("""
                                {"supcId":"82031","priceIncludeTax":"21.00","priceExcludeTax":"20.19"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.succeededIds[0]").value("82031"));
    }

    private Cookie localSessionCookie(String hostname) throws Exception {
        String setCookie = mvc.perform(get("/api/supplier-quote/public/wechat/session")
                        .with(request -> {
                            request.setServerName(hostname);
                            return request;
                        }))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader("Set-Cookie");
        return new Cookie("SQ_SESSION", cookieValue(setCookie));
    }

    private static String cookieValue(String setCookie) {
        if (setCookie == null || !setCookie.startsWith("SQ_SESSION=")) {
            throw new AssertionError("SQ_SESSION cookie missing");
        }
        return setCookie.substring("SQ_SESSION=".length(), setCookie.indexOf(';'));
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @ComponentScan(basePackages = {
            "com.exceptioncoder.toolbox.supplierquote",
            "com.exceptioncoder.toolbox.common.sqlite",
            "com.exceptioncoder.toolbox.common.dynamicconfig"
    })
    static class TestApplication {
        @Bean
        MarketQuoteBackend marketQuoteBackend() {
            return new TestMarketQuoteBackend();
        }
    }

    private static final class TestMarketQuoteBackend implements MarketQuoteBackend {
        @Override
        public MarketQuotePage findPage(BindingView binding, MarketQuoteQuery query) {
            MarketQuoteItem item = new MarketQuoteItem("82031", "1001", "YRN-40S", "40S精梳棉",
                    "C-090", "藏青", "A级", null, null, null, null,
                    "PENDING_QUOTE", null, true, true, false);
            return new MarketQuotePage(List.of(item), 1, 1, query.pageNo(), query.pageSize());
        }

        @Override
        public MarketQuoteSubmissionResult submit(BindingView binding, MarketQuotePriceInput input,
                                                  String idempotencyKey) {
            return new MarketQuoteSubmissionResult(List.of(input.supcId()), List.of());
        }

        @Override
        public MarketQuoteSubmissionResult submitBatch(BindingView binding, List<MarketQuotePriceInput> items,
                                                       String idempotencyKey) {
            return new MarketQuoteSubmissionResult(items.stream().map(MarketQuotePriceInput::supcId).toList(),
                    List.of());
        }

        @Override
        public void revoke(BindingView binding, String supcId) {}

        @Override
        public YarnQualityStandards findQualityStandards(BindingView binding, String productId) {
            return new YarnQualityStandards("820 T/10cm", "4%", "18 Cn", "6%", "12%",
                    "2 个/km", "18 个/km", "25 个/km", "4.2", "3 根");
        }
    }
}
