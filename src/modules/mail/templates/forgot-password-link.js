import { layout } from '../layout.js';

export default {
  name: 'forgot-password-link',
  subject: () => `Reset your ChatLeaf password 🍃`,
  html: (c) => layout({
    preheader: 'Click the link to reset your password',
    title: 'Reset Your Password',
    body: `
      <p style="margin: 0 0 16px 0;">We received a request to reset your ChatLeaf account password.</p>
      <p style="margin: 0 0 20px 0;">Click the button below. A brand new password will be automatically generated and sent to your email:</p>
      
      <div style="text-align: center; margin: 26px 0;">
        <a href="${c.resetLink}" style="background-color: #0fa958; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; display: inline-block;">Generate New Password</a>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0; font-size: 13px; color: #52796f; line-height: 1.6;">
        <tr><td style="padding-bottom: 4px;">⏱ Valid for <b>10 minutes</b> (single use only).</td></tr>
      </table>

      <div style="font-size: 12px; color: #889e95; margin-top: 16px;">
        If you did not request this, you can safely ignore this email. Your current password remains unchanged.
      </div>`
  }),
  text: (c) => `Reset your ChatLeaf password by clicking: ${c.resetLink} (Valid for 10 minutes).`
};
