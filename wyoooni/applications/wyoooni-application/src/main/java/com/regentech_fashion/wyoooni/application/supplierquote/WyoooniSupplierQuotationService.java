package com.regentech_fashion.wyoooni.application.supplierquote;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.DraftReceipt;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationAccess;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationDraftRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.SubmissionReceipt;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseRequestContext;
import org.springframework.http.HttpStatus;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** 将 Wyoooni 企业网关映射为供应商报价读写用例。 */
public class WyoooniSupplierQuotationService implements SupplierQuotationUseCase {
    private final SupplierQuoteWyoooniProperties properties;
    private final EnterpriseGateway gatewayClient;
    private final SupplierQuoteStore store;

    public WyoooniSupplierQuotationService(SupplierQuoteWyoooniProperties properties,
                                           EnterpriseGateway gatewayClient,
                                           SupplierQuoteStore store) {
        this.properties = properties;
        this.gatewayClient = gatewayClient;
        this.store = store;
    }

    @Override
    public BindingView requireBinding(String subjectHash) {
        return store.findBindingBySubject(subjectHash).orElseThrow(() ->
                new SupplierQuoteApiException(HttpStatus.PRECONDITION_REQUIRED,
                        "BUSINESS_ACCOUNT_BINDING_REQUIRED", "请先使用公司业务账号完成首次关联"));
    }

    @Override
    public QuotationAccess access(String ticket, BindingView binding) {
        return WyoooniSupplierQuoteExceptionMapper.call(() -> gatewayClient.exchange(
                "GET", quotationEndpoint(ticket), null,
                context(binding), null, QuotationAccess.class));
    }

    @Override
    public DraftReceipt saveDraft(String ticket, BindingView binding, QuotationDraftRequest request) {
        return WyoooniSupplierQuoteExceptionMapper.call(() -> gatewayClient.exchange(
                "PUT", quotationEndpoint(ticket) + "/draft", request,
                context(binding), request.idempotencyKey(), DraftReceipt.class));
    }

    @Override
    public SubmissionReceipt submit(String ticket, BindingView binding, String idempotencyKey,
                                    QuotationDraftRequest request) {
        return WyoooniSupplierQuoteExceptionMapper.call(() -> gatewayClient.exchange(
                "POST", quotationEndpoint(ticket) + "/submit", request,
                context(binding), idempotencyKey, SubmissionReceipt.class));
    }

    private String quotationEndpoint(String ticket) {
        String basePath = properties.getQuotationPath().replaceAll("/+$", "");
        String encodedTicket = URLEncoder.encode(ticket, StandardCharsets.UTF_8).replace("+", "%20");
        return basePath + "/" + encodedTicket;
    }

    private static EnterpriseRequestContext context(BindingView binding) {
        return new EnterpriseRequestContext(binding.accountId(), binding.sourceSystem(), binding.supplierId());
    }

}
