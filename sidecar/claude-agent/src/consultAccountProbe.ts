import { callAppServer, listCodexModels } from './codexAppServer.js'

/** Authenticated metadata requests only: never starts a thread, turn, or business question. */
export async function inspectConsultAccount(home: string, model: string,
  request = callAppServer, models = listCodexModels) {
  const checkedAt = Date.now()
  let stage = '账号登录'
  try {
    const account = (await request('account/read', { refreshToken: true }, home)).account as { type?: string } | null
    if (!account || account.type !== 'chatgpt') return {
      protocolVersion: 1, available: false, code: 'LOGIN_REQUIRED', checkedAt,
      message: '所选账号未完成 ChatGPT 登录，请管理员重新登录后再检测',
    }
    // Goes through the selected account's authenticated workspace route; local auth/cache is insufficient.
    stage = '工作区授权'
    await request('account/rateLimits/read', {}, home)
    stage = '咨询模型目录'
    const catalog = await models(home)
    if (!catalog.some(item => item.value === model)) return {
      protocolVersion: 1, available: false, code: 'MODEL_UNAVAILABLE', checkedAt,
      message: '所选账号当前未提供此咨询模型，请选择该账号支持的模型',
    }
    return { protocolVersion: 1, available: true, code: 'VALID', checkedAt,
      message: '登录、工作区授权与模型目录检测通过；实际业务轮次仍可能遇到运行错误' }
  } catch {
    // Provider stderr may contain credentials. Return a controlled reason instead of the raw exception.
    return { protocolVersion: 1, available: false, code: 'AUTHORIZATION_FAILED', checkedAt,
      message: `${stage}检测失败，请管理员核对登录、工作区权限及网络后重试` }
  }
}
