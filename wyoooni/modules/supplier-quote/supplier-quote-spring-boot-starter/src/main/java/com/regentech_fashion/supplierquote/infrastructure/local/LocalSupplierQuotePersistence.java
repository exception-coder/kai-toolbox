package com.regentech_fashion.supplierquote.infrastructure.local;

import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;

import java.util.Optional;
import java.util.function.Supplier;

/** Forge 报价身份与报价结果持久化端口。 */
public interface LocalSupplierQuotePersistence extends SupplierQuoteStore {
    /** 查询账号在指定报价任务下保存的草稿。 */
    Optional<DraftRow> findDraft(String ticket, String accountId);

    /** 使用乐观版本保存草稿，冲突时返回 {@code null}。 */
    DraftRow saveDraft(String ticket, String accountId, String payloadJson, int expectedVersion, long now);

    /** 查询账号在指定报价任务下的提交结果。 */
    Optional<SubmissionRow> findSubmission(String ticket, String accountId);

    /** 新增幂等报价提交记录。 */
    SubmissionRow insertSubmission(String ticket, String accountId, String idempotencyKey,
                                   String submissionId, String payloadJson, long now);

    /** 在当前持久化实现对应的数据源事务中执行操作。 */
    <T> T inTransaction(Supplier<T> action);

    /** Forge 报价草稿。 */
    record DraftRow(String payloadJson, int draftVersion, long savedAt) {}

    /** Forge 报价提交。 */
    record SubmissionRow(String idempotencyKey, String submissionId, String payloadJson, long submittedAt) {}
}
