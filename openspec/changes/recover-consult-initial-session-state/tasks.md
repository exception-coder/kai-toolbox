## 本地修复

- [x] 修复两个列表接口的空值查询及 SDK ID 规范化，保留权限与历史记录。
- [x] 咨询历史主导初始恢复，运行提示失败不再锁死入口，历史失败仍提供安全重试。
- [x] 前端恢复、系统显示与会话状态定向回归 21 项通过。
- [x] 后端 37 项定向回归及 toolbox-starter reactor 编译通过。
- [x] 前端 typecheck / 隔离输出构建。
- [x] 项目质量检查与严格规格校验通过。
- [x] 本地提交（提交号见 Git 历史，部署验收另列）。

## 待部署验收

- [ ] 用户明确确认后重启受影响的后端和前端，核验目标版本、接口、原咨询恢复及发送保护，连续观察至少 60 秒。
- [ ] 在允许读取的浏览器中验证桌面与移动端原咨询可恢复，无重复提问。

## 证据边界

2026-10-17：修复前 MockMvc 复现空 SDK ID 和空创建人导致的 HTTP 500、SDK ID 首尾空白漏判；前端复现辅助运行列表失败导致入口锁定。

- 修复后 Maven `-pl toolbox-starter -am test`（JDK 21，指定五个测试类，未执行全套测试）退出 0：ClaudeChatSessionListTest 2 项、ClaudeChatSessionAccessPolicyTest 11 项、SessionHistoryServiceTest 9 项、ConsultSessionListTest 1 项、ConsultServiceAccessTest 14 项，无失败或跳过。
- 前端恢复、系统显示及会话状态三个测试文件共 21 项通过；同时校正系统显示测试中已过期的保存按钮文案。typecheck 首次指出新测试夹具字段不全，补齐真实类型后恢复测试 5 项再次通过，`npm run typecheck`（含 Feature boundaries 和菜单目录检查）退出 0。
- `npx vite build --outDir ../.git/consult-recovery-frontend` 退出 0，6370 模块转换成功；隔离产物含修复后的咨询页面，未替换运行目录或发布助手 SDK。保留原有大包及静态/动态混合导入警告。
- Forge Quality JSON `status=PASSED`、退出 0；`executedCheckers=[]`，仅执行九项既有 API 探测，指向原运行服务，不代表本修复已运行验收。OpenSpec 严格校验通过。

当前未重启、未部署；末次 `node forge.mjs status` 与开始时服务身份一致，前后端及微信、Studio 均 ready、重启数 0。站点权限策略拒绝读取线上页面，组件测试不替代线上验收。已有其他任务未跟踪的测试产物保持原状。
