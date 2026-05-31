# ✅EasyExcel为啥内存占用小？

> 题号：0250 ｜ 分类：21_Excel与文件处理

---

## 速记

- 100 万行 Excel：POI 占 ~1.5-2GB，EasyExcel 仅 50-100MB
- 核心两个机制：SAX 流式解析 + 磁盘缓存

### SAX 解析（核心）

- 重写了 POI 对 07 版 xlsx 的解析；基于 `XSSFReader` + SAX 事件模型读 XML
- 事件回调：`startElement` / `characters` / `endElement`，逐行处理
- 关键类：`XlsxSaxAnalyser` + `XlsxRowHandler`
- 内存里只保留当前行，`</row>` 后立即丢弃；对比 DOM 把整棵树加载到内存

### 磁盘缓存（sharedStrings）

- xlsx 内 `sharedStrings.xml` 集中存所有重复字符串，单元格只存索引
- 默认用 `MapCache` 内存缓存；超阈值切换 `Ehcache` 写入临时文件释放内存
- 03 版仍依赖 POI 的 SAX 模式，上层做了模型转换封装
