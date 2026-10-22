import { layout } from '../layout.js';

export default {
  name: 'device-removed',
  subject: () => `Device removed from ChatLeaf account 🍃`,
  html: (c) => layout({
    preheader: `Device ${c.deviceName || ''} has been removed`,
    title: 'Device Removed Successfully',
    body: `
      <p style="margin: 0 0 16px 0;">The device <b>${c.deviceName || 'Unknown device'}</b> was successfully removed from your ChatLeaf account on <b>${c.timeIST || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</b>.</p>
      <div style="padding: 14px 16px; background-color: #f7fbf9; border-left: 3px solid #0fa958; border-radius: 6px; font-size: 13px; color: #3d5e50; line-height: 1.5; margin-top: 16px;">
        This device no longer has access to your chats or personal data. If it attempts to connect, it will be prompted to sign in with your current password.
      </div>`
  }),
  text: (c) => `The device ${c.deviceName || 'device'} was removed from your ChatLeaf account on ${c.timeIST || new Date().toISOString()}.`
};
