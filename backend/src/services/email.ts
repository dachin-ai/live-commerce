/**
 * 邮件发送服务（SMTP）
 * 用于：忘记密码验证码、可选注册验证等。
 * 未配置 SMTP 时 sendMail 不发送，调用方可根据返回值决定是否在响应中返回验证码（如开发环境）。
 */

import nodemailer from 'nodemailer'

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const APP_NAME = process.env.APP_NAME || '直播电商中台'

function isConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (!isConfigured()) {
    console.warn('[邮件] 未配置完整 SMTP（需 SMTP_HOST、SMTP_USER、SMTP_PASS、MAIL_FROM）')
    return null
  }
  if (transporter) return transporter
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER!, pass: SMTP_PASS! },
    })
    console.info('[邮件] SMTP 已初始化:', SMTP_HOST, 'port', SMTP_PORT, 'secure', SMTP_SECURE)
    return transporter
  } catch (e) {
    console.warn('[邮件] 初始化失败:', (e as Error).message)
    return null
  }
}

export interface SendPasswordResetCodeOptions {
  to: string
  code: string
  expiresMinutes?: number
}

/**
 * 发送忘记密码验证码邮件。
 * @returns true 表示已发送（或即将发送），false 表示未配置/发送失败，调用方可在开发环境下改为在响应中返回 code
 */
export async function sendPasswordResetCode(options: SendPasswordResetCodeOptions): Promise<boolean> {
  const { to, code, expiresMinutes = 10 } = options
  const transport = getTransporter()
  if (!transport) return false

  const from = `${APP_NAME} <${MAIL_FROM}>`
  const subject = `【${APP_NAME}】找回密码验证码`
  const html = `
    <p>您好，</p>
    <p>您正在申请找回密码，验证码为：<strong style="font-size:20px;letter-spacing:2px;">${code}</strong></p>
    <p>验证码有效期为 ${expiresMinutes} 分钟，请勿泄露给他人。</p>
    <p>如非本人操作，请忽略此邮件。</p>
    <hr/>
    <p style="color:#888;font-size:12px;">本邮件由系统自动发送，请勿直接回复。</p>
  `.trim()

  try {
    await transport.sendMail({ from, to, subject, html })
    console.info('[邮件] 验证码已发送至', to)
    return true
  } catch (e: any) {
    console.error('[邮件] 发送失败:', e?.message || e)
    if (e?.code) console.error('[邮件] 错误码:', e.code)
    if (e?.response) console.error('[邮件] 响应:', e.response)
    return false
  }
}

export { isConfigured as isEmailConfigured }
