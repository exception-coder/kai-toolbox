package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.TopologyView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteView;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTopologyLinkRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** 读取历史系统连线；公共图谱分析入口已退役。 */
@Service
public class TopologyService {
    private final ConsultTopologyLinkRepository linkRepo;
    private final ConsultEvidenceRouteService evidenceRouteService;

    public TopologyService(ConsultTopologyLinkRepository linkRepo,
                           ConsultEvidenceRouteService evidenceRouteService) {
        this.linkRepo = linkRepo;
        this.evidenceRouteService = evidenceRouteService;
    }

    public TopologyView listPersisted() {
        List<TopologyView.LinkEdge> links = linkRepo.findAll().stream()
                .map(link -> new TopologyView.LinkEdge(link.getFromSystem(), link.getToSystem(),
                        link.getRelation(), link.getDescription()))
                .toList();
        List<EvidenceRouteView> routes = evidenceRouteService.list().stream().map(EvidenceRouteView::from).toList();
        return new TopologyView(links, routes);
    }

    public TopologyView analyze(List<String> systems, String requestedEngine) {
        throw new ResponseStatusException(HttpStatus.GONE,
                "公共图谱链路分析已退役，请在业务咨询中按授权项目文档与定向源码核实跨项目关系。");
    }
}
