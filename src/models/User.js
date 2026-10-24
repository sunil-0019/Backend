import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userSchema = new mongoose.Schema({
  _id: { type: String, default: () => uuidv4() },
  userId: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  fullName: { type: String, default: '' },
  about: { type: String, default: 'Hey there! I am using ChatLeaf.' },
  photoKey: { type: String, default: null },
  googleId: { type: String, default: null, index: true, sparse: true },
  authProvider: { type: String, default: 'local' }, // 'local' | 'google'
  status: { type: String, default: 'ACTIVE' },
  tokenVersion: { type: Number, default: 0 },
  userIdChangeCount: { type: Number, default: 0 },
  userIdChangedAt: { type: Date, default: null },
  firstLoginAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Id virtual
userSchema.virtual('id').get(function() {
  return this._id.toString();
});

// Photo URL virtual
userSchema.virtual('photoUrl').get(function() {
  return this.photoKey || null;
});

// Name virtual getter/setter for backwards compatibility with existing fullName records
userSchema.virtual('displayName').get(function() {
  return this.name || this.fullName || '';
});

// Email immutability enforcement
userSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function() {
  const update = this.getUpdate();
  if (update && (update.email || (update.$set && update.$set.email))) {
    throw new Error('EMAIL_IMMUTABLE');
  }
});

export const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');
