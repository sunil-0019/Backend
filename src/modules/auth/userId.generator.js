import { randomInt } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import slugify from 'slugify';
import { loadRulePipeline, executeRulePipeline } from './rules/ruleRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike chars (0,o,1,l,i)

let userIdRulesCache = null;

async function getUserIdRules() {
  if (!userIdRulesCache) {
    const rulesDir = path.join(__dirname, 'rules', 'userId');
    userIdRulesCache = await loadRulePipeline(rulesDir);
  }
  return userIdRulesCache;
}

export async function isIdAcceptable(id, client, options = {}) {
  const rules = await getUserIdRules();
  const result = await executeRulePipeline(rules, id, {
    client,
    exceptUserUuid: options.exceptUserUuid || null,
  });
  return result;
}

let idGenQueue = Promise.resolve();

export async function generateUserId(name, client, options = {}) {
  // Serialize ID generation across concurrent calls
  const release = await new Promise(resolve => {
    idGenQueue = idGenQueue.then(() => resolve).catch(() => resolve);
  });

  try {
    const cleanName = (name || 'user').trim();

  // Create clean base with underscores: e.g. "Riya Sharma" -> "riya_sharma"
  let base = slugify(cleanName, { lower: true, strict: true, replacement: '_' })
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .replace(/^[0-9]+/, '')
    .slice(0, 30);

  if (!base || base.length < 3) {
    base = 'user';
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    // Generate 3-4 random digits
    const numDigits = attempt > 10 ? 4 : (randomInt(3, 5)); // 3 or 4 digits
    const digits = Array.from({ length: numDigits }, () => randomInt(0, 10)).join('');

    let id = `${base}_${digits}`;

    // If collision persists on later attempts, append alphanumeric salt
    if (attempt > 0) {
      const extraAlpha = Array.from({ length: Math.min(attempt, 4) }, () => ALPHA[randomInt(ALPHA.length)]).join('');
      id = `${base}_${digits}${extraAlpha}`;
    }

    // Ensure minimum 8 characters
    if (id.length < 8) {
      const needed = 8 - id.length;
      const extra = Array.from({ length: needed }, () => randomInt(0, 10)).join('');
      id += extra;
    }
    id = id.slice(0, 100);

    const check = await isIdAcceptable(id, client, options);
    if (check.valid) {
      return id;
    }
  }

  throw new Error('USER_ID_GENERATION_FAILED');
  } finally {
    release();
  }
}
