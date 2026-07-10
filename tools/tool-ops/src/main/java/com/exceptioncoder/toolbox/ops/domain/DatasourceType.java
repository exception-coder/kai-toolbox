package com.exceptioncoder.toolbox.ops.domain;

/**
 * 中间件类型。当前落地查询能力：MYSQL / ORACLE / REDIS。
 * RABBITMQ / KAFKA / ROCKETMQ / NACOS 先占位（可登记、可展示），查询控制台后续再补。
 */
public enum DatasourceType {
    MYSQL(Category.SQL, 3306),
    ORACLE(Category.SQL, 1521),
    REDIS(Category.REDIS, 6379),
    RABBITMQ(Category.MQ, 5672),
    KAFKA(Category.MQ, 9092),
    ROCKETMQ(Category.MQ, 9876),
    NACOS(Category.OTHER, 8848);

    public enum Category { SQL, REDIS, MQ, OTHER }

    private final Category category;
    private final int defaultPort;

    DatasourceType(Category category, int defaultPort) {
        this.category = category;
        this.defaultPort = defaultPort;
    }

    public Category category() {
        return category;
    }

    public int defaultPort() {
        return defaultPort;
    }

    /** 是否已支持在线查询（未支持的类型登记后只展示、不给查询入口）。 */
    public boolean queryable() {
        return category == Category.SQL || category == Category.REDIS;
    }
}
