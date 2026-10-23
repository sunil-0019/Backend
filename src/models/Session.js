import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const sessionSchema = new mongoose.Schema({
  _id: { type: String, default: () => uuidv4() },
  userUuid: { type: String, required: true, index: true },
  deviceId: { type: String, default: null },
  deviceName: { type: String, default: 'Primary Device' },
  model: { type: String, default: null },
  platform: { type: String, default: 'web' },
  appVersion: { type: String, default: null },
  ip: { type: String, default: '127.0.0.1' },
  geoCity: { type: String, default: '' },
  geoCountry: { type: String, default: '' },
  refreshHash: { type: Buffer, required: true },
  prevRefreshHash: { type: Buffer, default: null },
  expiresAt: { type: Date, required: true, index: true },
  lastActiveAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

sessionSchema.virtual('id').get(function() {
  return this._id.toString();
});

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema, 'sessions');
