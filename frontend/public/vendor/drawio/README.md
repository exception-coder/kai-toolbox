# draw.io 只读渲染资源

固定版本：`v32.5.5`。来源：[官方 Release](https://github.com/jgraph/drawio/releases/tag/v32.5.5) 的 `draw.war`，仅提取 `js/viewer-static.min.js`；许可证从同一 tag 的 `LICENSE` 获取并随资源保留。上游该 tag 无独立 `NOTICE` 文件；bundle 的第三方许可注释保持原样。

该 WAR 的 Viewer 已完整内嵌 `stencils.min.js`（已核对完整内容包含关系），不再重复分发或加载 stencils。不要与仓库源码中需要额外图形资源的 Viewer 构建混用。

| 文件 | SHA-256 |
| --- | --- |
| viewer-static.min.js | 69DC32958AC3FA9F43C22957D384BC980331C92C36148FBE3F59AD3337AAAB4F |

未修改第三方 bundle。Forge 在使用时按需加载，通过 sandbox iframe 和 CSP 限制权限；自定义外部图像、字体、链接及数学扩展不在当前离线预览范围。升级时替换 Viewer 及许可证、更新版本路径和校验值，并验证压缩/多页、内置图形、非法输入和无外部请求。
