import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bus } from '../core/bus.js';
import { db } from '../config/db.js';
import { redis } from '../config/redis.js';
import { RULES } from '../config/rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function mountModules(app) {
  const entries = fs.readdirSync(__dirname, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const moduleIndexPath = path.join(__dirname, entry.name, 'index.js');
      if (fs.existsSync(moduleIndexPath)) {
        try {
          const fileUrl = new URL(`file:///${moduleIndexPath.replace(/\\/g, '/')}`).href;
          const module = await import(fileUrl);
          if (typeof module.register === 'function') {
            await Promise.resolve(module.register({
              app,
              bus,
              rules: RULES,
              db,
              redis,
            }));
          }
        } catch (err) {
          console.error(`Failed to register module [${entry.name}]:`, err);
          throw err;
        }
      }
    }
  }
}
