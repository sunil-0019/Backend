import { layout } from '../layout.js';

export default {
  name: 'userid-updated',
  subject: () => `Your ChatLeaf User ID was updated 🍃`,
  html: (c) => layout({
    preheader: `User ID changed to ${c.newUserId}`,
    title: 'User ID Changed Successfully',
    body: `
      <p style="margin: 0 0 16px 0;">Your ChatLeaf User ID has been successfully updated:</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7fbf9; border: 1px solid #dfeed9; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
        <tr>
          <td width="38%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; border-bottom: 1px solid #e6f2eb;">Previous User ID</td>
          <td width="62%" style="padding: 12px 14px; font-size: 14px; color: #718d80; text-decoration: line-through; border-bottom: 1px solid #e6f2eb;">${c.oldUserId}</td>
        </tr>
        <tr>
          <td width="38%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap; border-bottom: 1px solid #e6f2eb;">New User ID</td>
          <td width="62%" style="padding: 12px 14px; font-size: 15px; color: #0b7a3e; font-weight: 700; font-family: monospace; border-bottom: 1px solid #e6f2eb;">${c.newUserId}</td>
        </tr>
        <tr>
          <td width="38%" style="padding: 12px 14px; font-size: 13px; color: #52796f; font-weight: 600; white-space: nowrap;">Next Edit Available</td>
          <td width="62%" style="padding: 12px 14px; font-size: 14px; color: #0d2b22; font-weight: 600;">${c.nextChangeAt ? new Date(c.nextChangeAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Available now'}</td>
        </tr>
      </table>
      <div style="font-size: 12px; color: #62796f; line-height: 1.5; margin-top: 14px;">
        🔒 Your previous User ID remains reserved for 90 days to prevent anyone else from claiming it or impersonating you.
      </div>`
  }),
  text: (c) => `Your ChatLeaf User ID was changed from ${c.oldUserId} to ${c.newUserId}. Next allowed change: ${c.nextChangeAt || 'Available'}.`
};
