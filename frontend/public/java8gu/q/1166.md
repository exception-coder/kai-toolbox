# ✅基于EasyExcel+线程池解决POI文件导出时的内存溢出及超时问题

> 题号：1166 ｜ 分类：21_Excel与文件处理

---

## 速记

**问题**：POI 导出大文件 OOM + 同步导出请求超时

**方案三件套**：

1. **EasyExcel** 替换 POI → 解决 OOM
2. **`@Async` + 自定义线程池** 异步执行 → 解决用户等待/超时
3. **OSS + 邮件通知** → 文件存云端，邮件给下载链接

### 关键代码片段

```java
// 线程池：核心 10，最大 20，队列 1024
new ThreadPoolExecutor(10, 20, 0L, MILLISECONDS,
    new LinkedBlockingQueue<>(1024), namedFactory, new AbortPolicy());

// 异步导出
@Async("exportExecutor")
public String exportDataAsync(List<DataModel> data) {
    InputStream in = generateExcelFile(data);          // EasyExcel 写到 ByteArrayOutputStream
    String url = ossService.uploadFile(name, in);      // 上传 OSS，生成预签名 URL
    emailService.sendEmail(toAddr, "导出通知", "链接: " + url);
}
```

- Controller 立即返回「任务已开始」，不阻塞
- 预签名 URL 设置 1 小时过期
