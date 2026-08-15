package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import org.springframework.stereotype.Service;

import java.util.List;

/** 保留原调用契约的 AI 洞察兼容门面。 */
@Service
public class ReqAnalysisService {

    private final ReqInsightApplicationService insightApplicationService;

    public ReqAnalysisService(ReqInsightApplicationService insightApplicationService) {
        this.insightApplicationService = insightApplicationService;
    }

    public String analyze(ReqItem item) {
        return insightApplicationService.analyzeItem(item);
    }

    public String analyzePortfolio(List<ReqItem> items) {
        return insightApplicationService.analyzePortfolio(items);
    }
}
