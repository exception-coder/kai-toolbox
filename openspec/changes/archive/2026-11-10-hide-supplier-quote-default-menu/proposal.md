## Why

供应商报价 H5 属于低频独立演示模块，用户要求默认不显示其入口。

## What Changes

- 默认菜单集合排除供应商报价 H5，偏好设置仍可手动开启。
- 保留已保存的菜单偏好及现有报价路由。

## Capabilities

### New Capabilities

- `feature-default-menu-visibility`: 功能清单可声明默认菜单可见性。

### Modified Capabilities

无。

## Impact

修改 FeatureManifest、默认菜单集合和供应商报价 manifest。依据当前源码 menuVisibility.ts 与 featureRegistry.ts；不修改服务端、权限或独立发布入口。
