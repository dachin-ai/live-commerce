/**
 * 测试 SMTP 发信（需先在 backend/.env 配置好 SMTP_*）
 * 运行：在 backend 目录下执行  npx tsx scripts/test-email.ts
 */

import path from 'path'
import dotenv from 'dotenv'

// 确保加载 backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
if (process.cwd().endsWith('backend') === false) {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') })
}

import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER
const APP_NAME = process.env.APP_NAME || '直播电商中台'

async function main() {
  console.log('当前 SMTP 配置:')
  console.log('  SMTP_HOST:', SMTP_HOST)
  console.log('  SMTP_PORT:', SMTP_PORT)
  console.log('  SMTP_SECURE:', SMTP_SECURE)
  console.log('  SMTP_USER:', SMTP_USER)
  console.log('  MAIL_FROM:', MAIL_FROM)
  console.log('')

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('缺少 SMTP_HOST / SMTP_USER / SMTP_PASS，请在 backend/.env 中配置')
    process.exit(1)
  }

  const to = SMTP_USER
  console.log('将发送测试邮件到:', to)
  console.log('')

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER!, pass: SMTP_PASS! },
  })

  try {
    const info = await transport.sendMail({
      from: `${APP_NAME} <${MAIL_FROM}>`,
      to,
      subject: `【${APP_NAME}】邮件测试`,
      text: '这是一封测试邮件，说明 SMTP 配置正确。',
    })
    console.log('发送成功:', info.messageId)
  } catch (e: any) {
    console.error('发送失败，完整错误:')
    console.error(e)
    console.error('')
    console.error('错误信息:', e?.message)
    console.error('错误码:', e?.code)
    console.error('响应:', e?.response)
    process.exit(1)
  }
}

main()
