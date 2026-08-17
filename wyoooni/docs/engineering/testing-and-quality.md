# Wyoooni 测试与质量门禁

## 独立宿主链路

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot'
mvn --% -pl wyoooni/applications/wyoooni-application -am test -Dskip.frontend=true
```

必须验证JPA Repository扫描、SQLite EntityManagerFactory、企业与业务Adapter装配、独立宿主启动，以及Oracle未启用时本地H5可启动。

## Forge兼容链路

```powershell
mvn --% -pl toolbox-starter -am test -Dskip.frontend=true
```

## 提交前检查

- 执行 `git diff --check`。
- 检查是否意外写入密码、token、AppSecret或Oracle账号信息。
- 只报告实际执行并通过的验证。
- 未获得当前任务明确授权时，不得提交或推送Git。
