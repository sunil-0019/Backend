import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MailService {
  constructor() {
    this.templates = new Map();
    this.sentEmailsHistory = []; // Useful for tests and inspections
    this.loadTemplates();
  }

  async loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    if (!fs.existsSync(templatesDir)) return;

    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const fileUrl = new URL(`./templates/${file}`, import.meta.url).href;
      const module = await import(fileUrl);
      const template = module.default;
      if (template && template.name) {
        this.templates.set(template.name, template);
      }
    }
  }

  getTemplate(name) {
    const tmpl = this.templates.get(name);
    if (!tmpl) {
      throw new Error(`Email template not found: ${name}`);
    }
    return tmpl;
  }

  /**
   * Send an email using registered template
   * @param {string} templateName
   * @param {{ email: string, name?: string }} to
   * @param {object} ctx
   * @param {{ sync?: boolean, client?: object }} options
   */
  async send(templateName, to, ctx, options = {}) {
    // Ensure templates are loaded
    if (this.templates.size === 0) {
      await this.loadTemplates();
    }

    const template = this.getTemplate(templateName);
    const toEmail = (typeof to === 'string' ? to : to.email).trim().toLowerCase();
    const toName = typeof to === 'object' ? to.name || '' : '';

    const context = {
      ...ctx,
      name: toName || ctx.name || '',
      email: toEmail,
      timeIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      timeUTC: new Date().toUTCString(),
    };

    const subject = typeof template.subject === 'function' ? template.subject(context) : template.subject;
    const htmlContent = typeof template.html === 'function' ? template.html(context) : template.html;
    const textContent = typeof template.text === 'function' ? template.text(context) : template.text || '';

    // Record into outbox
    const queryTarget = options.client || db;
    const outboxResult = await queryTarget.query(
      `INSERT INTO email_outbox (to_email, template, payload, status)
       VALUES ($1, $2, $3, 'QUEUED')
       RETURNING id`,
      [toEmail, templateName, JSON.stringify(context)]
    );
    const outboxId = outboxResult.rows[0].id;

    // In test environment or if mock key, deliver immediately to memory
    if (env.NODE_ENV === 'test' || env.BREVO_API_KEY.includes('mock') || env.BREVO_API_KEY.includes('test')) {
      this.sentEmailsHistory.push({
        id: outboxId,
        to: toEmail,
        template: templateName,
        subject,
        html: htmlContent,
        text: textContent,
        context,
        sentAt: new Date(),
      });

      await queryTarget.query(
        `UPDATE email_outbox SET status = 'SENT', provider_message_id = $1, sent_at = now() WHERE id = $2`,
        [`mock-msg-${Date.now()}`, outboxId]
      );
      return { id: outboxId, success: true, providerMessageId: `mock-msg-${Date.now()}` };
    }

    // Call Brevo API
    try {
      const brevoPayload = {
        sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM_EMAIL },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent,
        textContent,
        tags: [templateName],
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(brevoPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.message) errorMsg = parsed.message;
        } catch (_) {}

        await db.query(
          `UPDATE email_outbox SET status = 'FAILED', error = $1 WHERE id = $2`,
          [errorMsg, outboxId]
        );

        let userFacingError = `Brevo Email Error: ${errorMsg}`;
        if (errorMsg.includes('unrecognised IP address')) {
          userFacingError = `Brevo IP Restriction: Your IP is not authorized in Brevo. Please authorize it at https://app.brevo.com/security/authorised_ips (Brevo has sent an authorization link to your account email sunilpal001001@gmail.com).`;
        }

        console.error(`\n❌ [Email Delivery Error (${templateName} to ${toEmail})]:`, userFacingError);

        if (options.sync) {
          throw AppError.emailSendFailed(userFacingError);
        }
        return { id: outboxId, success: false, error: userFacingError };
      }

      const result = await response.json();
      const messageId = result.messageId || `brevo-${Date.now()}`;
      await db.query(
        `UPDATE email_outbox SET status = 'SENT', provider_message_id = $1, sent_at = now() WHERE id = $2`,
        [messageId, outboxId]
      );
      return { id: outboxId, success: true, providerMessageId: messageId };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const failureMsg = err.message || 'Email delivery failed';
      console.error(`\n❌ [Email Exception]:`, failureMsg);
      if (options.sync) {
        throw AppError.emailSendFailed(`Email delivery failed: ${failureMsg}`);
      }
      return { id: outboxId, success: false, error: failureMsg };
    }
  }
}

export const mailService = new MailService();
