# ✅为啥POI的SXSSFWorkbook占用内存更小?

> 题号：0509 ｜ 分类：21_Excel与文件处理

---

## 速记

- 核心原理：**部分行数据写入磁盘临时文件**，内存只留少量行
- 关键类：`SheetDataWriter`（可选 `GZIPSheetDataWriter` 压缩）
- 写入路径：`SXSSFSheet.createRow` → `SheetDataWriter.writeRow` → `_out.write()` 写临时 XML 文件
- 临时文件本质是 xlsx 内部那份 sheet xml 的片段

### 行缓存窗口

```java
new SXSSFWorkbook(rowAccessWindowSize)  // 默认 100
```

- 内存中保留最近 `rowAccessWindowSize` 行，超出则把最旧的 flush 到磁盘
- `-1` 不限制（等同 XSSFWorkbook）；`0` 非法
- flush 后的旧行无法再通过 `getRow` 访问
