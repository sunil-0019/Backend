import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userIdHistorySchema = new mongoose.Schema({
  _id: { type: String, default: () => uuidv4() },
  userUuid: { type: String, required: true, index: true },
  oldUserId: { type: String, required: true, index: true },
  newUserId: { type: String, required: true },
  changedAt: { type: Date, default: Date.now, index: true },
  reservedUntil: { type: Date, required: true, index: true },
}, {
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userIdHistorySchema.virtual('id').get(function() {
  return this._id.toString();
});

export const UserIdHistory = mongoose.models.UserIdHistory || mongoose.model('UserIdHistory', userIdHistorySchema, 'user_id_history');
