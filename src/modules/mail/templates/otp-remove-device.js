import { layout } from '../layout.js';

export default {
  name: 'otp-remove-device',
  subject: (c) => `${c.otp} is your code to remove device ${c.deviceName || ''}`,
  html: (c) => layout({
    preheader: `Device removal code: ${c.otp}`,
    title: 'Confirm Device Removal',
    body: `
      <p style="margin: 0 0 16px 0;">A request was received to remove the following device from your ChatLeaf account:</p>
      
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7fbf9; border: 1px solid #dfeed9; border-radius: 10px; overflow: hidden; margin-bottom: 20px;">
        <tr>
          <td width="35%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap;">📱 Device</td>
          <td width="65%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600;">${c.deviceName || 'Device'} ${c.city ? `(${c.city})` : ''}</td>
        </tr>
      </table>

      <div style="margin: 20px 0; padding: 18px 20px; background-color: #f7fbf9; border: 1.5px dashed #0fa958; border-radius: 14px; text-align: center;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #0b7a3e; line-height: 1.1;">${c.otp}</div>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0; font-size: 13px; color: #52796f; line-height: 1.6;">
        <tr><td style="padding-bottom: 4px;">⏱ Valid for <b>10 minutes</b>.</td></tr>
        <tr><td style="padding-bottom: 4px;">🔁 Attempt <b>${c.attempt} of ${c.maxAttempts}</b> (${c.remaining} attempts left). Once confirmed, this device will lose access immediately.</td></tr>
      </table>

      <div style="padding: 12px 14px; background-color: #fdfaf3; border-left: 3px solid #e0a324; border-radius: 6px; font-size: 13px; color: #7a5814; line-height: 1.5; margin-top: 16px;">
        If you did not request this, please change your password immediately in ChatLeaf settings.
      </div>`
  }),
  text: (c) => `Code to remove device ${c.deviceName}: ${c.otp}. Valid 10 minutes. Attempt ${c.attempt} of ${c.maxAttempts} (${c.remaining} attempts left).`
};
