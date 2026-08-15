package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 在一个短事务内提交已校验洞察历史和兼容投影。 */
@Service
public class ReqInsightPersistenceService {

    private final ReqInsightRepository repository;

    public ReqInsightPersistenceService(ReqInsightRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void saveAll(List<ReqInsight> insights) {
        for (ReqInsight insight : insights) {
            repository.insert(insight);
            repository.updateCurrentProjection(insight.itemId(), insight.payloadJson(), insight.createdAt());
        }
    }
}
