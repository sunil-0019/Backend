import { layout } from '../layout.js';

export default {
  name: 'new-password-generated',
  subject: () => `Your new ChatLeaf password 🍃`,
  html: (c) => layout({
    preheader: 'Your new auto-generated password',
    title: 'Your Password Has Been Reset',
    body: `
      <p style="margin: 0 0 16px 0;">Your password has been successfully reset. Here is your new auto-generated password:</p>
      
      <div style="margin: 22px 0; padding: 18px 20px; background-color: #f7fbf9; border: 1.5px dashed #0fa958; border-radius: 14px; text-align: center;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, monospace; font-size: 32px; font-weight: 800; letter-spacing: 2px; color: #0b7a3e; line-height: 1.1;">${c.newPassword}</div>
      </div>

      <p style="margin: 0 0 16px 0; font-size: 14px; color: #2d4a3e; line-height: 1.6;">
        You can sign in to ChatLeaf immediately using your User ID or email along with this new password.
      </p>

      <div style="padding: 14px 16px; background-color: #f7fbf9; border-left: 3px solid #0fa958; border-radius: 6px; font-size: 13px; color: #3d5e50; line-height: 1.5; margin: 16px 0;">
        <b>Next Steps:</b> You can keep this password, or you can change it anytime in ChatLeaf settings to a custom password of your choice. All other devices have been logged out for your security.
      </div>`
  }),
  text: (c) => `Your ChatLeaf password was reset. New password: ${c.newPassword}. Please sign in and change it if desired.`
};
