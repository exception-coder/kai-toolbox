package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolution;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeResolutionPort;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeSource;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;

/** 为需求池条目解析并赋予后端权威需求类型。 */
@Slf4j
@Service
public class ReqRequirementTypeService {

    private final ObjectProvider<RequirementTypeResolutionPort> resolutionPorts;

    public ReqRequirementTypeService(ObjectProvider<RequirementTypeResolutionPort> resolutionPorts) {
        this.resolutionPorts = resolutionPorts;
    }

    /**
     * 根据独立登记的需求事实执行分类。解析能力不可用或失败时保留明确的未知状态。
     *
     * @param item 待赋值需求条目
     */
    public void resolveIndependentItem(ReqItem item) {
        RequirementTypeResolution resolution = resolutionPorts.orderedStream()
                .findFirst()
                .map(port -> safelyResolve(port, item))
                .orElseGet(RequirementTypeResolution::unknown);
        apply(item, resolution);
    }

    /**
     * 采用 PRD 会话已经确认的类型，不重复调用 Agent。
     *
     * @param item        待赋值需求条目
     * @param prdTypeCode PRD 会话持久化类型
     */
    public void applyPrdSessionType(ReqItem item, String prdTypeCode) {
        RequirementType type = RequirementType.fromCode(prdTypeCode);
        RequirementTypeResolution resolution = type.isClassified()
                ? new RequirementTypeResolution(type, RequirementTypeSource.PRD_SESSION, 1)
                : RequirementTypeResolution.unknown();
        apply(item, resolution);
    }

    private RequirementTypeResolution safelyResolve(
            RequirementTypeResolutionPort port,
            ReqItem item
    ) {
        try {
            FutureTask<RequirementTypeResolution> task = new FutureTask<>(() ->
                    port.resolveRequirementType(item.getTitle(), item.getDescription(), null, null));
            Thread.ofVirtual().name("reqpool-type-resolution").start(task);
            return task.get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            log.warn("[reqpool] 需求类型解析被中断 itemId={}", item.getId());
            return RequirementTypeResolution.unknown();
        } catch (ExecutionException | RuntimeException exception) {
            log.warn("[reqpool] 需求类型解析失败 itemId={}: {}", item.getId(), exception.getMessage());
            return RequirementTypeResolution.unknown();
        }
    }

    private void apply(ReqItem item, RequirementTypeResolution resolution) {
        item.setReqType(resolution.type().name());
        item.setReqTypeSource(resolution.source().name());
        item.setReqTypeConfidence(resolution.confidence());
    }
}
