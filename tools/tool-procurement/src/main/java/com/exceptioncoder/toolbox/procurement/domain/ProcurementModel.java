package com.exceptioncoder.toolbox.procurement.domain;

/** 仅生成待验证的结构化字段，不负责访问网站或写业务数据库。 */
public interface ProcurementModel {
    /** 根据受控说明和缓存正文返回 JSON。 */
    String extract(String instructions, String text);
}
