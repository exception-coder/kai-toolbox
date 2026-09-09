package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Rule;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.service.ProcurementRuleGroupService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProcurementRuleGroupTest {
    @Test
    void groupingPreservesSourcesButDoesNotRepeatThemInPrompt() throws Exception {
        var store = mock(ProcurementStore.class);
        var source = new Rule("KW_001", "KEYWORD", "排水管网", true, Map.of("注意", "本次范围"));
        var dictionary = new Rule("STG_08", "DICTIONARY", "招标公告", true, Map.of());
        var custom = new Rule("CUSTOM", "CONTEXT", "自定义", true, Map.of());
        when(store.rules()).thenReturn(List.of(source, dictionary, custom));
        var service = new ProcurementRuleGroupService(store, new ObjectMapper());
        assertThat(service.groups()).hasSize(12);
        assertThat(service.groups().stream().flatMap(g -> g.sources().stream()).toList()).containsExactlyInAnyOrder(source, dictionary, custom);
        var snapshot = service.snapshot();
        assertThat(snapshot).extracting(Rule::id).contains("GRP_NETWORK", "STG_08", "CUSTOM").doesNotContain("KW_001");
        var amount = ProcurementRuleGroupService.select(snapshot, Set.of("procurement_amount"));
        assertThat(amount).extracting(Rule::id).containsExactly("GRP_AMOUNT", "GRP_EVIDENCE", "CUSTOM");
        var stage = ProcurementRuleGroupService.select(snapshot, Set.of("notice_stage"));
        assertThat(stage).extracting(Rule::id).contains("GRP_STAGE", "GRP_DICT_STAGE", "STG_08").doesNotContain("GRP_NETWORK", "GRP_AMOUNT");
    }

    @Test
    void savedGroupOverridesDefaultsAndDisableRemovesItsDictionary() throws Exception {
        var store = mock(ProcurementStore.class);
        List<Rule> records = new ArrayList<>(List.of(new Rule("STG_08", "DICTIONARY", "招标公告", true, Map.of())));
        when(store.rules()).thenAnswer(call -> List.copyOf(records));
        doAnswer(call -> { records.add(call.getArgument(0)); return null; }).when(store).saveRule(any());
        var service = new ProcurementRuleGroupService(store, new ObjectMapper());
        var initial = service.groups().stream().filter(g -> g.rule().id().equals("GRP_DICT_STAGE")).findFirst().orElseThrow().rule();
        service.save(initial.id(), new Rule(initial.id(), "GROUP", "新阶段规则", false, initial.fields()));
        assertThat(service.groups().stream().filter(g -> g.rule().id().equals(initial.id())).findFirst().orElseThrow().rule().name()).isEqualTo("新阶段规则");
        assertThat(service.snapshot()).extracting(Rule::id).doesNotContain("GRP_DICT_STAGE", "STG_08");
        assertThat(records).extracting(Rule::id).contains("STG_08");
        assertThatThrownBy(() -> service.save("unknown", initial)).hasMessageContaining("分组不存在");
    }
}
