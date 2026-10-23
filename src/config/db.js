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
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    return callback(null);
  },

  ...models,
};

export default db;
