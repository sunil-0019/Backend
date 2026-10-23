import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: '5m', // 5 minutes
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });
  } catch (err) {
    return null;
  }
}
