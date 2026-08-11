---
id: lambda-order-sort
title: Lambda 重构订单排序
summary: 用行为参数化替代匿名内部类，让排序规则更聚焦。
nodeType: REFACTOR
parentId: lambda
sort: 1
exampleTitle: 订单金额排序
question: Lambda 表达式为什么要求捕获变量有效 final？
related: stream-lifecycle:USE
---
# Lambda 重构订单排序

## 一句话理解

Lambda 把“传入一段行为”从匿名类样板代码中解放出来。

## 解决什么问题

排序、过滤、回调等只需要一个动作的场景，不再被匿名内部类的结构噪音淹没。

## ERP 业务应用

订单按金额、交期或优先级排序时，可以把不同规则声明为 `Comparator`，由应用层按场景选择。

<!-- section:beforeCode -->
```java
orders.sort(new Comparator<Order>() {
    public int compare(Order left, Order right) {
        return left.amount().compareTo(right.amount());
    }
});
```
<!-- section:afterCode -->
```java
orders.sort(Comparator.comparing(Order::amount));
```
<!-- section:explanation -->
方法引用直接表达排序键，避免匿名类样板代码。
<!-- section:shortAnswer -->
Lambda 捕获的是局部变量的值；要求有效 final 可以避免栈变量生命周期和并发可见性产生歧义。
<!-- section:detailAnswer -->
局部变量存在线程栈中，Lambda 对其进行值捕获。禁止后续修改使语义稳定，也避免开发者误以为捕获的是可变引用槽。
<!-- section:projectAnswer -->
我把 ERP 订单多种排序方式建模为命名 `Comparator`，按页面查询条件组合，减少重复匿名类。
