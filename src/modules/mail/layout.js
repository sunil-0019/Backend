// src/modules/mail/layout.js
import { env } from '../../config/env.js';

export const layout = ({ preheader, title, body }) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>ChatLeaf</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f0f7f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0d2b22; }
    @media only screen and (max-width: 600px) {
      .container-table { width: 100% !important; border-radius: 0 !important; }
      .content-cell { padding: 20px 16px !important; }
      .header-cell { padding: 24px 16px 20px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f7f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0d2b22;">
  <!-- Hidden Preheader -->
  <span style="display: none; font-size: 1px; color: #f0f7f3; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${preheader}
  </span>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f7f3;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <!-- Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="580" class="container-table" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #dfeed9; box-shadow: 0 4px 16px rgba(10,50,30,0.04); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td class="header-cell" align="center" style="background: linear-gradient(180deg, #f7fcf9 0%, #ffffff 100%); padding: 28px 24px 22px 24px; border-bottom: 1px solid #eaf3ee;">
              <div style="text-align: center; line-height: 1;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; white-space: nowrap;">
                  <span style="color: #094044;">Chat</span><span style="color: #0fa958;">Leaf</span>
                </span>
              </div>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #52796f; font-weight: 500; margin-top: 8px; text-align: center; letter-spacing: 0.2px;">
                Your personal chat space · ChatLeaf aapka apna hai
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content-cell" style="padding: 30px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2d4a3e;">
              <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 700; color: #0d2b22; line-height: 1.3;">${title}</h2>
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fbf9; padding: 20px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #62796f; text-align: center; border-top: 1px solid #eaf3ee;">
              ChatLeaf will never ask for your OTP by chat, call, or email.<br />
              Need help? <a href="mailto:${env.SUPPORT_EMAIL}" style="color: #0fa958; text-decoration: none; font-weight: 600;">${env.SUPPORT_EMAIL}</a> · © ChatLeaf
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
