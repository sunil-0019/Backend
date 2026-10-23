import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const loginEventSchema = new mongoose.Schema({
  _id: { type: String, default: () => uuidv4() },
  userUuid: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  sessionId: { type: String, default: null },
  kind: { type: String, default: 'LOGIN_OTP' },
  success: { type: Boolean, default: true },
  ip: { type: String, default: '127.0.0.1' },
  deviceName: { type: String, default: '' },
  platform: { type: String, default: 'web' },
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

loginEventSchema.virtual('id').get(function() {
  return this._id.toString();
});

export const LoginEvent = mongoose.models.LoginEvent || mongoose.model('LoginEvent', loginEventSchema, 'login_events');
