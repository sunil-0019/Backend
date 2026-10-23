import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const emailOutboxSchema = new mongoose.Schema({
  _id: { type: String, default: () => uuidv4() },
  toEmail: { type: String, required: true, index: true },
  template: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, default: 'QUEUED' },
  providerMessageId: { type: String, default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
}, {
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

emailOutboxSchema.virtual('id').get(function() {
  return this._id.toString();
});

export const EmailOutbox = mongoose.models.EmailOutbox || mongoose.model('EmailOutbox', emailOutboxSchema, 'email_outbox');
