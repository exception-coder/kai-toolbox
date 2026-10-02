## 1. 实施
- [x] 1.1 按会话账号读取官方真实配额并提供访问控制接口。
- [x] 1.2 用量页优先展示剩余额度、实际窗口和共享标识，本地统计独立。
## 2. 验证
- [x] 2.1 验证窗口映射、账号隔离、失败与时间戳；前后端编译及门禁。
- [ ] 2.2 授权重启后真实页面/供应商验收与60秒稳定观察。

验证记录：前端9项、Sidecar5项、Java4项专项回归通过；前端typecheck、独立Vite构建、Sidecar TypeScript与完整后端宿主打包（skip.frontend=true）通过。Forge执行验证ui/regression/api/spec/design均PASS，OpenSpec严格校验通过。项目质量CLI退出0/status PASSED；static executedCheckers为空，runtime执行9项旧服务API冒烟，不代表新版额度接口运行验收。

真实CLI的account/read与account/rateLimits/read已查询成功，仅周窗口有数据，未消耗模型推理额度。浏览器桌面/390×844手机验证了热更新后的订阅区域位置、缺接口诚实不可用与重试；旧后端未加载新接口，完整链路及60秒稳定观察未执行。其余引擎无已核验订阅接口时明确不可用。用户明确跳过旧治理临时文件扫描，未伪称该扫描通过。

完整宿主第一次打包意外触发assistant:release，已中止并从之前Vite验证快照恢复stable清单与loader文件，SHA256一致；新增内容寻址构建产物保留在忽略目录，不纳入提交。没有重启、推送或生产部署。

## 3. 全引擎汇总优化
- [x] 3.1 紧凑五小时/周账号汇总、共享来源去重、多账号独立加载和刷新。
- [x] 3.2 Claude真实配额链路、凭据切换缓存失效与真实时间戳。
- [x] 3.3 专项回归、构建、桌面/手机布局与Forge门禁。
- [ ] 3.4 授权后端重启后Claude真实页面验收及60秒观察。

汇总验证：前端14项、Java8项专项回归通过；前端typecheck、无发布的独立Vite构建、完整宿主打包（skip.frontend=true）通过。Forge regression/api/ui/spec/design通过，项目质量CLI status PASSED/退出0，static未运行checker、runtime为9项既有API冒烟。桌面及390×844手机实际显示9引擎账号来源、Codex真实周剩余和重置时间，手机页面宽度与scrollWidth均390；读不到的账号与缺失窗口诚实不可用。Claude新增后端链路未加载，真实页面及60秒观察未执行；未重启、推送或发布共享SDK。
