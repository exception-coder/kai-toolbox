package com.exceptioncoder.toolbox.procurement.api;

import com.exceptioncoder.toolbox.procurement.service.ProcurementRuleGroupService;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Rule;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 合并规则管理入口，原词条通过来源信息追溯。 */
@RestController
@RequestMapping("/api/procurement/rule-groups")
public class ProcurementRuleGroupController {
    private final ProcurementRuleGroupService groups;
    public ProcurementRuleGroupController(ProcurementRuleGroupService groups) { this.groups = groups; }
    @GetMapping
    public List<ProcurementRuleGroupService.Group> list() { return groups.groups(); }
    @PutMapping("/{id}")
    public Rule save(@PathVariable String id, @RequestBody Rule rule) { return groups.save(id, rule); }
}
