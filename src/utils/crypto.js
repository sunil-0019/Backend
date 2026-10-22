import argon2 from 'argon2';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword + env.PASSWORD_PEPPER, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword + env.PASSWORD_PEPPER);
  } catch (err) {
    return false;
  }
}

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
