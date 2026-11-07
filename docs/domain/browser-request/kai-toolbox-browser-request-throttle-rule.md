---
id: kai-toolbox-browser-request-throttle-rule
project: kai-toolbox
module: browser-request
title: 回放节流反风控区间规则
type: rule
stability: draft
tags: [节流, 反风控, 迭代延迟]
related: [kai-toolbox-browser-request-record-replay-flow, kai-toolbox-browser-request-variable-fanout-rule]
summary: 同一步骤内的迭代重复调用比切换到下一个步骤更容易触发风控，因此迭代间延迟区间应不小于步骤间延迟区间，且每次延迟在区间内随机取值。
---

> ⚠️ 草拟骨架：内容为占位，**必须由该模块业务 owner 用真实口径替换后再改 stability: stable**。

## 业务定义

任务回放在步骤之间、以及同一步骤的多次迭代之间，都会插入延迟等待，且两种延迟遵循不同的区间配置，核心业务判断是：**同一个步骤内针对同一个接口反复调用（迭代），比"切换到下一个不同的步骤"更容易触发目标站点的风控/限流**，因此同步骤迭代之间建议使用比步骤间切换更大的延迟区间。

若调用方没有单独配置迭代延迟区间，则退化为与步骤间延迟相同的区间（保持与未加区分前的行为兼容）。每次实际延迟时长在配置的最小值与最大值之间随机取值，而不是固定值，进一步降低被识别为自动化脚本的规律性。任务的最后一个步骤的最后一次迭代执行完毕后不再等待。

## 适用范围 / 边界

该规则是站点录制编排回放引擎的通用节流策略，为规避目标网站的反自动化风控而设计，只要走"回放"执行链路即生效（见 record-replay-flow）。具体的延迟数值区间是可调配置，规则本身的重点在于"同步骤迭代延迟应不小于步骤间延迟"这条相对关系与"随机化取值"这条策略，不在于具体数值。

## 备注

kai-toolbox 代码调研起草，待 owner 核实。
