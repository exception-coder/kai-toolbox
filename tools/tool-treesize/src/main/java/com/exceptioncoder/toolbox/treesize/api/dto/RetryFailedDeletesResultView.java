package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.FileDeleteService;

import java.util.List;

/**
 * Wire shape of {@code POST /api/treesize/file-delete/failed/retry}: how many entries we
 * attempted, how many actually deleted, how many stayed queued, plus the still-failing tail.
 */
public record RetryFailedDeletesResultView(
        int attempted,
        int deleted,
        int queued,
        List<FailedDeleteView> remaining
) {
    public static RetryFailedDeletesResultView from(FileDeleteService.RetryResult r) {
        return new RetryFailedDeletesResultView(
                r.attempted(),
                r.deleted(),
                r.queued(),
                r.remaining().stream().map(FailedDeleteView::from).toList()
        );
    }
}
