package com.regentech_fashion.supplierquote.spi;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.DraftReceipt;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationAccess;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationDraftRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.SubmissionReceipt;

/**
 * 报价业务用例端口，由 Forge 演示适配器或真实 SCM 宿主实现。
 */
public interface SupplierQuotationUseCase {
    /** 要求当前微信身份已绑定 SCM 账号。 */
    BindingView requireBinding(String subjectHash);

    /** 加载专属报价任务。 */
    QuotationAccess access(String ticket, BindingView binding);

    /** 保存供应商报价草稿。 */
    DraftReceipt saveDraft(String ticket, BindingView binding, QuotationDraftRequest request);

    /** 幂等提交供应商报价。 */
    SubmissionReceipt submit(String ticket, BindingView binding, String idempotencyKey,
                             QuotationDraftRequest request);
}
