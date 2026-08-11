package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;

/** 首问编排结果及服务端签发的证据路由。 */
public record ConsultInitialDispatch(
        ConsultOrchestrationResult orchestration,
        ConsultEvidenceRouteResolution evidenceRoute
) {
}
