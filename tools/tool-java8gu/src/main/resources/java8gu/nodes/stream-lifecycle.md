---
id: stream-lifecycle
title: Stream 为什么不能重复使用
summary: Stream 是一次性、惰性求值的计算流水线，终端操作后即被消费。
nodeType: CONCEPT
parentId: stream
sort: 1
exampleTitle: 订单状态统计重构
question: 为什么 Stream 不能重复使用？
related: lambda-order-sort:RELATED
---
# Stream 为什么不能重复使用

## 一句话理解

Stream 不是保存数据的容器，而是一次性的计算流水线；终端操作会消费流水线。

## 解决什么问题

它把筛选、转换、分组和聚合表达为可组合步骤，减少循环、临时集合与状态变量。

## 原理

中间操作只描述流水线，终端操作触发遍历。执行结束后内部状态被标记为已消费，再次执行会抛出 `IllegalStateException`。

## 常见误区

- 把 Stream 保存到字段并跨方法复用。
- 在 `peek` 中承载必须执行的业务副作用。
- 为了链式写法牺牲可读性或错误处理。

## ERP 业务应用

订单列表按状态分组、库存明细汇总、价格记录过滤与去重，都适合使用短小且无副作用的 Stream 流水线。

<!-- section:beforeCode -->
```java
Map<String, Integer> totals = new HashMap<>();
for (Order order : orders) {
    if (order.isEffective()) {
        totals.put(order.status(), totals.getOrDefault(order.status(), 0) + 1);
    }
}
```
<!-- section:afterCode -->
```java
Map<String, Long> totals = orders.stream()
        .filter(Order::isEffective)
        .collect(Collectors.groupingBy(Order::status, Collectors.counting()));
```
<!-- section:explanation -->
用过滤和分组直接表达“有效订单按状态计数”，移除临时状态和手工累加。
<!-- section:shortAnswer -->
Stream 代表一次计算流水线，终端操作后已经消费，因此不能再次执行。
<!-- section:detailAnswer -->
中间操作是惰性的，终端操作触发遍历并关闭流水线。若需要重复计算，应保存数据源并重新调用 `stream()`。
<!-- section:projectAnswer -->
在 ERP 订单统计中，我用 `filter + groupingBy` 完成有效订单分类汇总，并在每次统计时从订单集合创建新 Stream。
