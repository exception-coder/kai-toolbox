package com.exceptioncoder.toolbox.ops.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReadOnlySqlPolicyTest {

    @Test
    void acceptsSelectAndWithQueries() {
        assertThat(ReadOnlySqlPolicy.validateAndNormalize("select * from orders;"))
                .isEqualTo("select * from orders");
        assertThat(ReadOnlySqlPolicy.validateAndNormalize(
                "with recent as (select * from orders) select * from recent"))
                .startsWith("with recent");
    }

    @Test
    void ignoresKeywordsAndSemicolonsInsideQuotesAndComments() {
        assertThat(ReadOnlySqlPolicy.validateAndNormalize(
                "-- update is documentation\nselect 'delete;drop' as text_value from dual"))
                .contains("select");
    }

    @Test
    void rejectsWritesAndMultipleStatements() {
        assertThatThrownBy(() -> ReadOnlySqlPolicy.validateAndNormalize("update orders set status = 1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ReadOnlySqlPolicy.validateAndNormalize("select 1; select 2"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ReadOnlySqlPolicy.validateAndNormalize(
                "with changed as (delete from orders returning id) select * from changed"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ReadOnlySqlPolicy.validateAndNormalize(
                "select * from orders into outfile '/tmp/orders.csv'"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
