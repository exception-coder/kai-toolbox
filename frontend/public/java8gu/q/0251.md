# ✅如何针对大Excel做文件读取？

> 题号：0251 ｜ 分类：21_Excel与文件处理

---

## 速记

- POI 的 `SXSSFWorkbook` 只能解决「写」的内存问题，**读**仍会 OOM
- 大文件读首选 **EasyExcel**：基于 SAX 流式解析，逐行回调

### 内存对比（27.3MB 文件）

| 方式 | 内存占用 |
|---|---|
| XSSFWorkbook（POI） | 1000+ MB |
| EasyExcel | <100 MB |

### 用法

```java
EasyExcel.read(filename, new MyListener()).sheet().doRead();
// MyListener implements ReadListener<T>，重写 invoke 逐行处理
```
