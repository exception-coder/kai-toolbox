> 已废弃（2026-11-10）：remove-pending-sql-tool 及 Vibe Coding 界面清理已移除 SQL 登记与管理弹窗（台账数据与服务保留）。未完成任务不再执行；归档不代表已验收，规格未合并到主规格。

## 1. Design and implementation

- [x] 1.1 Confirm existing timestamp facts and define the compact review hierarchy.
- [x] 1.2 Add a reusable SQL registration timeline.
- [x] 1.3 Refine the read-only SQL workspace for desktop and mobile.
- [x] 1.4 Refine the management overlay hierarchy and progressive evidence disclosure.

## 2. Verification

- [x] 2.1 Add focused component regression tests.
- [x] 2.2 Pass frontend typecheck, tests and production build.
- [x] 2.3 Verify the live mobile rendering from the supplied 948×2048 capture, then remove the over-designed timeline and keep SQL detail recoverable by disclosure.
- [x] 2.4 Pass OpenSpec strict validation and Forge Quality Gate.

## 3. SQL-only management

- [x] 3.1 Remove title, target and change-type configuration from the management overlay while preserving metadata on save.
- [x] 3.2 Add focused regression coverage for SQL-only editing and metadata preservation.
- [x] 3.3 Pass frontend component, production build, OpenSpec and Forge verification; restart and commit the change.
