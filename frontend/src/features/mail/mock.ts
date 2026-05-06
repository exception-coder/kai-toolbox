import { registerHttp } from '@/lib/mock/registry'
import type { MailDetail, MailListItem, MailListResponse, MailStats } from './types'

const NOW = Date.now()
const DAY = 86_400_000

const MOCK_MAILS: MailDetail[] = [
  {
    id: 'mock-001',
    messageId: '<verify-001@amazon.com>',
    fromAddr: 'no-reply@amazon.com',
    toAddr: 'shop-us-01@example.com',
    subject: 'Amazon Seller Account Verification',
    bodyHtml: `<html><body style="font-family:sans-serif;padding:20px">
      <h2>Verify Your Amazon Seller Account</h2>
      <p>Dear Seller, please verify your account by clicking the link below:</p>
      <p><a href="#" style="color:#ff9900;font-weight:bold">Click here to verify</a></p>
      <p>Verification code: <strong>847291</strong></p>
      <p>This link expires in 24 hours.</p>
    </body></html>`,
    bodyText: null,
    attachments: [],
    receivedAt: NOW - 10 * 60 * 1000,
    read: false,
    rawSize: 4096,
  },
  {
    id: 'mock-002',
    messageId: '<verify-002@ebay.com>',
    fromAddr: 'registration@ebay.com',
    toAddr: 'shop-us-02@example.com',
    subject: 'eBay Account Registration - Email Confirmation',
    bodyHtml: `<html><body style="font-family:sans-serif;padding:20px">
      <h2 style="color:#e53238">Confirm Your eBay Email Address</h2>
      <p>You recently registered for an eBay account. Please confirm your email address.</p>
      <p>Your confirmation code: <strong style="font-size:24px;letter-spacing:4px">392847</strong></p>
      <p>Enter this code on the eBay registration page to complete your registration.</p>
    </body></html>`,
    bodyText: null,
    attachments: [],
    receivedAt: NOW - 45 * 60 * 1000,
    read: false,
    rawSize: 3800,
  },
  {
    id: 'mock-003',
    messageId: '<verify-003@shopify.com>',
    fromAddr: 'noreply@shopify.com',
    toAddr: 'shop-eu-01@example.com',
    subject: 'Confirm your Shopify account email',
    bodyHtml: `<html><body style="font-family:sans-serif;padding:20px;background:#f4f4f4">
      <div style="max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:8px">
        <h1 style="color:#96bf48">Shopify</h1>
        <p>Please confirm your email address to activate your account.</p>
        <p style="text-align:center">
          <a href="#" style="background:#96bf48;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">Confirm email address</a>
        </p>
        <p style="color:#999;font-size:12px">If the button doesn't work, use code: 571034</p>
      </div>
    </body></html>`,
    bodyText: null,
    attachments: [],
    receivedAt: NOW - 2 * 60 * 60 * 1000,
    read: true,
    rawSize: 5200,
  },
  {
    id: 'mock-004',
    messageId: '<verify-004@etsy.com>',
    fromAddr: 'transaction@etsy.com',
    toAddr: 'shop-us-01@example.com',
    subject: 'Please verify your Etsy email address',
    bodyText: 'Hello,\n\nPlease verify your email address for your new Etsy shop.\n\nVerification code: 204857\n\nThis code expires in 30 minutes.\n\nThank you,\nEtsy Team',
    bodyHtml: null,
    attachments: [],
    receivedAt: NOW - DAY + 30 * 60 * 1000,
    read: true,
    rawSize: 820,
  },
  {
    id: 'mock-005',
    messageId: '<verify-005@walmart.com>',
    fromAddr: 'seller-support@walmart.com',
    toAddr: 'shop-us-03@example.com',
    subject: 'Walmart Marketplace - Seller Registration Confirmation',
    bodyHtml: `<html><body style="font-family:sans-serif;padding:20px">
      <img src="#" alt="Walmart" style="width:120px"/>
      <h2>Welcome to Walmart Marketplace</h2>
      <p>Thank you for registering as a Walmart Marketplace seller.</p>
      <p>Your verification code is: <strong style="font-size:20px">739201</strong></p>
      <p>Please enter this code within 15 minutes to complete registration.</p>
    </body></html>`,
    bodyText: null,
    attachments: [],
    receivedAt: NOW - 3 * DAY,
    read: true,
    rawSize: 4600,
  },
  {
    id: 'mock-006',
    messageId: '<verify-006@amazon.co.jp>',
    fromAddr: 'no-reply@amazon.co.jp',
    toAddr: 'shop-jp-01@example.com',
    subject: 'Amazonセラーアカウント確認メール',
    bodyHtml: `<html><body style="font-family:sans-serif;padding:20px">
      <h2>Amazonセラーアカウントの確認</h2>
      <p>以下のコードを使用してアカウントを確認してください：</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#ff9900">583920</p>
      <p>このコードは30分間有効です。</p>
    </body></html>`,
    bodyText: null,
    attachments: [],
    receivedAt: NOW - 5 * DAY,
    read: false,
    rawSize: 3100,
  },
]

function toListItem(m: MailDetail): MailListItem {
  return {
    id: m.id,
    fromAddr: m.fromAddr,
    toAddr: m.toAddr,
    subject: m.subject,
    receivedAt: m.receivedAt,
    read: m.read,
    hasAttachment: m.attachments.length > 0,
    rawSize: m.rawSize,
  }
}

// mutable read state for optimistic updates in mock
const readState = new Map<string, boolean>(MOCK_MAILS.map(m => [m.id, m.read]))

registerHttp('GET', '/mail/inbox', ctx => {
  const size = parseInt(ctx.query.get('size') ?? '20', 10)
  const page = parseInt(ctx.query.get('page') ?? '0', 10)
  const toAddress = ctx.query.get('toAddress') ?? undefined
  const isReadParam = ctx.query.get('isRead')
  const keyword = ctx.query.get('keyword') ?? undefined

  let items = MOCK_MAILS.map(m => ({ ...m, read: readState.get(m.id) ?? m.read }))

  if (toAddress) {
    items = items.filter(m => m.toAddr.toLowerCase().includes(toAddress.toLowerCase()))
  }
  if (isReadParam != null) {
    const filterRead = isReadParam === 'true'
    items = items.filter(m => (readState.get(m.id) ?? m.read) === filterRead)
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    items = items.filter(m =>
      m.subject?.toLowerCase().includes(kw) ||
      m.fromAddr.toLowerCase().includes(kw)
    )
  }

  items.sort((a, b) => b.receivedAt - a.receivedAt)

  const total = items.length
  const unreadCount = items.filter(m => !(readState.get(m.id) ?? m.read)).length
  const paged = items.slice(page * size, page * size + size)

  const resp: MailListResponse = {
    items: paged.map(toListItem),
    total,
    page,
    size,
    unreadCount,
  }
  return resp
})

registerHttp('GET', '/mail/inbox/:id', ctx => {
  const mail = MOCK_MAILS.find(m => m.id === ctx.params.id)
  if (!mail) return null as unknown as MailDetail
  readState.set(mail.id, true)
  return { ...mail, read: true } satisfies MailDetail
})

registerHttp('PATCH', '/mail/inbox/:id/read', ctx => {
  readState.set(ctx.params.id, true)
  return { success: true }
})

registerHttp('DELETE', '/mail/inbox/:id', ctx => {
  const idx = MOCK_MAILS.findIndex(m => m.id === ctx.params.id)
  if (idx !== -1) MOCK_MAILS.splice(idx, 1)
  readState.delete(ctx.params.id)
  return { success: true }
})

registerHttp('GET', '/mail/stats', () => {
  const total = MOCK_MAILS.length
  const unreadCount = MOCK_MAILS.filter(m => !(readState.get(m.id) ?? m.read)).length
  return { total, unreadCount } satisfies MailStats
})
