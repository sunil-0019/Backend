import { layout } from '../layout.js';

export default {
  name: 'otp-signup',
  subject: (c) => `${c.otp} is your ChatLeaf verification code`,
  html: (c) => layout({
    preheader: `Your verification code is ${c.otp}`,
    title: `Verify your email, ${c.name || 'there'}`,
    body: `
      <p style="margin: 0 0 16px 0;">Use the verification code below to complete creating your ChatLeaf account:</p>
      <div style="margin: 22px 0; padding: 18px 20px; background-color: #f7fbf9; border: 1.5px dashed #0fa958; border-radius: 14px; text-align: center;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #0b7a3e; line-height: 1.1;">${c.otp}</div>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0; font-size: 13px; color: #52796f; line-height: 1.6;">
        <tr><td style="padding-bottom: 4px;">⏱ Valid for <b>10 minutes</b>.</td></tr>
        <tr><td style="padding-bottom: 4px;">🔁 Attempt <b>${c.attempt} of ${c.maxAttempts}</b> (${c.remaining} attempts left). Only the newest code works.</td></tr>
      </table>
      <div style="font-size: 12px; color: #889e95; margin-top: 16px;">
        If you did not request this, please ignore this email. Never share this code with anyone.
      </div>`
  }),
  text: (c) => `Your ChatLeaf code is ${c.otp}. Valid 10 minutes. Attempt ${c.attempt} of ${c.maxAttempts} (${c.remaining} attempts left).`
};
