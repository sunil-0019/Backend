import { layout } from '../layout.js';

export default {
  name: 'welcome',
  subject: (c) => `Welcome to ChatLeaf, ${c.name}! Your account details 🍃`,
  html: (c) => layout({
    preheader: 'Your ChatLeaf account credentials',
    title: `Welcome, ${c.name}! 🎉`,
    body: `
      <p style="margin: 0 0 16px 0;">Your ChatLeaf account has been created. Here are your sign-in credentials:</p>
      
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7fbf9; border: 1px solid #dfeed9; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
        <tr>
          <td width="36%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">👤 Name</td>
          <td width="64%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.name}</td>
        </tr>
        <tr>
          <td width="36%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">🆔 User ID</td>
          <td width="64%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 700; font-family: monospace; letter-spacing: 0.5px; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.userId}</td>
        </tr>
        <tr>
          <td width="36%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">🔑 Password</td>
          <td width="64%" style="padding: 12px 14px; font-size: 15px; color: #0b7a3e; font-weight: 700; font-family: monospace; letter-spacing: 1px; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.password}</td>
        </tr>
        <tr>
          <td width="36%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle;">✉ Email</td>
          <td width="64%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle;">
            <div>${c.email}</div>
            <div style="font-size: 11px; color: #718d80; font-weight: normal; margin-top: 2px;">Immutable (cannot be changed)</div>
          </td>
        </tr>
      </table>

      <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #0d2b22;">⏱ Timings</h3>
      <ul style="margin: 0 0 18px 0; padding-left: 20px; line-height: 1.6; font-size: 14px; color: #2d4a3e;">
        <li style="margin-bottom: 6px;">Account created: <b>${c.createdAtIST || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</b></li>
        <li style="margin-bottom: 6px;">Your sign-up OTP was valid for 10 minutes and is now used.</li>
        <li style="margin-bottom: 6px;">User ID: can be changed up to <b>2 times in 3 months</b>.</li>
        <li style="margin-bottom: 6px;">Password: change anytime in settings (min 8 chars, 1 capital, 1 special char).</li>
      </ul>

      <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #0d2b22;">🔒 Your Privacy</h3>
      <ul style="margin: 0 0 18px 0; padding-left: 20px; line-height: 1.6; font-size: 14px; color: #2d4a3e;">
        <li style="margin-bottom: 6px;">Your chats and media are private to you and the people you talk to.</li>
        <li style="margin-bottom: 6px;">Your email is never shared with other users. We do not sell your data.</li>
        <li style="margin-bottom: 6px;">Up to 3 active devices can be connected at a time.</li>
      </ul>

      <h3 style="margin: 20px 0 10px 0; font-size: 16px; color: #0d2b22;">🛡 Security Tips</h3>
      <ul style="margin: 0 0 20px 0; padding-left: 20px; line-height: 1.6; font-size: 14px; color: #2d4a3e;">
        <li style="margin-bottom: 6px;">Save your credentials safely and change your password whenever desired.</li>
        <li style="margin-bottom: 6px;">Every login sends an alert email to this address.</li>
        <li style="margin-bottom: 6px;">Removing any device requires an OTP sent to your email.</li>
      </ul>

      <div style="text-align: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid #eef6f1; font-weight: 600; color: #0fa958; font-size: 14px;">
        ChatLeaf – your personal space 🍃
      </div>`
  }),
  text: (c) => `Welcome to ChatLeaf, ${c.name}!\nUser ID: ${c.userId}\nPassword: ${c.password}\nEmail: ${c.email} (immutable)\n\nPlease save your credentials safely.`
};
