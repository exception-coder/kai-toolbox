package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultEvidenceRoute;

import java.util.List;

/** 首问解析出的最小数据库授权集合及可追溯快照。 */
public record ConsultEvidenceRouteResolution(
        List<String> evidenceSystems,
        String snapshot,
        String promptContext,
        List<ConsultEvidenceRoute> matchedRoutes
) {
}
