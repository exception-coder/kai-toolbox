package com.exceptioncoder.toolbox.supplierquote;

import com.exceptioncoder.toolbox.supplierquote.config.SupplierQuoteWechatForgeProperties;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(
        classes = SupplierQuoteFlowIntegrationTest.TestApplication.class,
        properties = {
                "toolbox.sqlite.file=target/supplier-quote-flow-test.db",
                "regentech.supplier-quote.wechat.mode=mock",
                "regentech.supplier-quote.wechat.secure-cookie=false",
                "regentech.supplier-quote.scm.mode=mock"
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
        mvc.perform(get("/api/supplier-quote/public/wechat/session").param("returnTo", returnTo))
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

        mvc.perform(post("/api/supplier-quote/public/scm-bindings").cookie(sessionCookie)
                        .contentType("application/json")
                        .content("""
                                {"username":"supplier-demo","password":"123456",
                                 "returnTo":"/showcase/supplier-quote/q/demo-quote"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.binding.scmUserId").value("scm-demo-001"));

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
    static class TestApplication {}
}
