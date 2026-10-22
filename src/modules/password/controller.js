import { passwordService } from './service.js';

export const passwordController = {
  async changePassword(req, res, next) {
    try {
      const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
      const result = await passwordService.changePassword(
        req.user.id,
        req.session.id,
        {
          currentPassword: req.body.currentPassword,
          newPassword: req.body.newPassword,
          ip,
          deviceName: req.session.deviceName,
          platform: req.session.platform,
        }
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async sendForgotPasswordOtp(req, res, next) {
    try {
      const result = await passwordService.sendForgotPasswordOtp(req.body.email);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async resetPasswordWithOtp(req, res, next) {
    try {
      const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
      const result = await passwordService.resetPasswordWithOtp(
        req.body.email,
        req.body.otp,
        req.body.newPassword,
        ip
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async sendForgotPasswordLink(req, res, next) {
    try {
      const email = req.body?.email || req.user?.email;
      const keepSessionId = req.session?.id || null;
      const result = await passwordService.sendForgotPasswordLink({ email, keepSessionId });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async resetPasswordWithLink(req, res, next) {
    try {
      const token = req.query?.token || req.body?.token;
      const newPassword = req.body?.newPassword || null;
      const result = await passwordService.resetPasswordWithLink({ token, newPassword });

      if (req.accepts('html') && !req.accepts('json')) {
        return res.status(200).send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ChatLeaf - Password Reset</title></head>
          <body style="margin:0;padding:40px 16px;background:#f0f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d2b22;display:flex;justify-content:center;">
            <div style="max-width:480px;width:100%;background:#ffffff;border-radius:18px;border:1px solid #dfeed9;padding:36px 28px;text-align:center;box-shadow:0 4px 16px rgba(10,50,30,0.04);">
              <div style="font-size:32px;margin-bottom:12px;">✅</div>
              <h2 style="margin:0 0 12px 0;color:#0fa958;font-size:22px;">Password Reset Successful</h2>
              <p style="font-size:15px;color:#2d4a3e;line-height:1.6;margin:0 0 20px 0;">A brand new auto-generated password has been sent to your email. Please check your inbox and sign in to ChatLeaf.</p>
              <div style="font-size:13px;color:#62796f;">You can now close this tab.</div>
            </div>
          </body>
          </html>
        `);
      }

      res.status(200).json(result);
    } catch (err) {
      if (req.accepts('html') && !req.accepts('json')) {
        return res.status(err.statusCode || 400).send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ChatLeaf - Link Expired</title></head>
          <body style="margin:0;padding:40px 16px;background:#fef7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2b0d0d;display:flex;justify-content:center;">
            <div style="max-width:480px;width:100%;background:#ffffff;border-radius:18px;border:1px solid #fed7d7;padding:36px 28px;text-align:center;box-shadow:0 4px 16px rgba(50,10,10,0.04);">
              <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
              <h2 style="margin:0 0 12px 0;color:#e53e3e;font-size:22px;">Reset Link Expired</h2>
              <p style="font-size:15px;color:#4a2d2d;line-height:1.6;margin:0 0 20px 0;">This password reset link is invalid, has expired (valid for 10 minutes), or has already been used. Please request a new link from ChatLeaf.</p>
              <div style="font-size:13px;color:#796262;">You can now close this tab.</div>
            </div>
          </body>
          </html>
        `);
      }
      next(err);
    }
  },
};
