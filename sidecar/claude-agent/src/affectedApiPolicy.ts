export const FORGE_AFFECTED_API_TOOL_DESCRIPTION = [
  '把当前开发会话新增、修改或删除的服务端 HTTP 接口登记到 Forge“涉及接口”台账。',
  '实质修改 Controller、route、handler 或接口契约后应调用；同 method+path 再次调用会更新原记录。',
  '登记不等于验证：默认 UNVERIFIED；只有实际运行测试、构建或安全探测后，才能填写 PASSED/FAILED 及验证证据。',
  '不得登记 Token、Cookie、密码、完整敏感响应，也不得用该工具调用任何业务接口。',
].join('')

export const FORGE_AFFECTED_API_STEER = [
  '【涉及接口登记】当本轮新增、修改或删除服务端 HTTP 接口、Controller、route 或 handler 契约时，',
  '在最终回复前调用 forge.register_affected_apis，登记 method、path、变更类型、源码位置和说明。',
  '登记默认是 UNVERIFIED；只有确实执行了测试、构建或安全探测，才可补充 PASSED/FAILED、验证方式、命令和摘要。',
  '禁止把“代码已修改”或模型判断写成 PASSED，禁止登记凭据或完整敏感响应。',
].join('')
