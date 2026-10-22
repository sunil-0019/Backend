import { layout } from '../layout.js';

export default {
  name: 'password-updated',
  subject: () => `Your ChatLeaf password was changed 🍃`,
  html: (c) => layout({
    preheader: 'Your ChatLeaf password was updated',
    title: 'Password Updated Successfully',
    body: `
      <p style="margin: 0 0 16px 0;">The password for your ChatLeaf account was updated on <b>${c.timeIST || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</b>.</p>
      
      <div style="padding: 14px 16px; background-color: #f7fbf9; border-left: 3px solid #0fa958; border-radius: 6px; font-size: 13px; color: #3d5e50; line-height: 1.5; margin: 16px 0;">
        <b>Security notice:</b> All other logged-in devices were automatically signed out for your safety. They will need to sign in again with your new password.
      </div>
      
      <div style="font-size: 12px; color: #889e95; margin-top: 16px;">
        If you did not make this change, please reset your password immediately or contact ChatLeaf support.
      </div>`
  }),
  text: (c) => `Your ChatLeaf password was updated on ${c.timeIST || new Date().toISOString()}. All other sessions were logged out.`
};
