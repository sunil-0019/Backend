import mongoose from 'mongoose';
import { env } from './env.js';
import * as models from '../models/index.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = env.MONGO_URI || env.DATABASE_URL;
  if (!uri) {
    throw new Error('MONGO_URI is required to connect to MongoDB');
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('🍃 [ChatLeaf] MongoDB connected successfully');
    return mongoose.connection;
  } catch (err) {
    console.error('❌ [ChatLeaf] MongoDB connection error:', err.message);
    throw err;
  }
}

export const db = {
  mongoose,
  connection: mongoose.connection,
  connect: connectDB,
  close: async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      isConnected = false;
    }
  },

  /**
   * Run operations inside a MongoDB transaction (Atlas replica sets support multi-document transactions)
   */
  async withTransaction(callback) {
    // If not connected, connect first
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    try {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (err) {
      // If transactions are not supported on this deployment, run directly
      if (err.message && (err.message.includes('Transaction numbers are only allowed') || err.message.includes('standalone'))) {
        return callback(null);
      }
      throw err;
    }
  },

  ...models,
};

export default db;
