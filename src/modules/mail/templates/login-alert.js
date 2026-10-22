import { layout } from '../layout.js';

export default {
  name: 'login-alert',
  subject: () => `New sign-in to your ChatLeaf account 🍃`,
  html: (c) => layout({
    preheader: `New login on ${c.deviceName || 'a device'}`,
    title: 'Security Alert: New Sign-in',
    body: `
      <p style="margin: 0 0 16px 0;">A new sign-in was detected on your ChatLeaf account:</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7fbf9; border: 1px solid #dfeed9; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">📱 Device</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.deviceName || 'Unknown device'} (${c.platform || 'web'})</td>
        </tr>
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">📍 Location</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.city || 'Unknown'}, ${c.country || 'IN'}</td>
        </tr>
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">🌐 IP Address</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">${c.ip || '127.0.0.1'}</td>
        </tr>
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">⏱ Sign-in Time</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle; border-bottom: 1px solid #e6f2eb;">
            <div>${c.timeIST || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
            <div style="font-size: 11px; color: #718d80; font-weight: normal; margin-top: 2px;">${c.timeUTC || new Date().toUTCString()} UTC</div>
          </td>
        </tr>
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; vertical-align: middle;">👥 Active Devices</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600; vertical-align: middle;">${c.deviceCount || 1} / 3 active</td>
        </tr>
      </table>
      <div style="padding: 14px 16px; background-color: #f7fbf9; border-left: 3px solid #0fa958; border-radius: 6px; font-size: 13px; color: #3d5e50; line-height: 1.5;">
        <b>Security note:</b> If this was you, you can safely ignore this email. If you did not sign in, please update your password immediately in ChatLeaf settings to protect your account.
      </div>`
  }),
  text: (c) => `New sign-in on ${c.deviceName || 'device'} from ${c.city || 'Unknown'}, ${c.country || 'IN'} at ${c.timeIST || new Date().toISOString()}. Total active devices: ${c.deviceCount || 1} of 3. If this wasn't you, update your password in ChatLeaf settings immediately.`
};
