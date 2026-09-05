// forgeLoginToken 来自参与者自己的 Forge 登录流程；不要使用所有者的令牌。
export async function exchangeInvitation(
  requestBaseUrl: string,
  forgeLoginToken: string,
  invitationCode: string,
) {
  const response = await fetch(
    `${requestBaseUrl.replace(/\/$/, '')}/api/session-client/v1/invitations/exchange`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${forgeLoginToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invitationCode }),
    },
  )
  if (!response.ok) throw new Error(`邀请兑换失败（HTTP ${response.status}），请核对账号或申请新邀请。`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object'
    || !('accessToken' in data) || typeof data.accessToken !== 'string'
    || !('grantId' in data) || typeof data.grantId !== 'string'
    || !('expiresAt' in data) || typeof data.expiresAt !== 'string') {
    throw new Error('邀请兑换响应不完整，请检查服务端版本。')
  }
  return { accessToken: data.accessToken, grantId: data.grantId, expiresAt: data.expiresAt }
}
