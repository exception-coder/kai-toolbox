# 独立供应商报价 H5

此目录是 `wyoooni-application` 使用的独立 H5 源码。Forge 已移除供应商报价菜单、路由、配置目录和后端装配；此目录不再导出 FeatureManifest。

在 `frontend/` 执行 `npm run h5:dev` 开发，`npm run h5:build` 构建到 `dist-pages/supplier-quote-h5`。独立应用的 Maven 打包继续使用该命令。共享后端 Starter 保留在 `wyoooni/modules/supplier-quote/`；已有报价数据不会因 Forge 移除入口而被删除。
