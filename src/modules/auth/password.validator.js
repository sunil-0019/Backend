import path from 'path';
import { fileURLToPath } from 'url';
import { loadRulePipeline, executeRulePipeline } from './rules/ruleRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passwordRulesCache = null;

export async function getPasswordRules() {
  if (!passwordRulesCache) {
    const rulesDir = path.join(__dirname, 'rules', 'password');
    passwordRulesCache = await loadRulePipeline(rulesDir);
  }
  return passwordRulesCache;
}

export async function validatePassword(password, ctx = {}) {
  const rules = await getPasswordRules();
  const result = await executeRulePipeline(rules, password, ctx);

  const fields = result.errors.map(err => ({
    field: ctx.fieldName || 'newPassword',
    error: err.error,
    message: err.message,
  }));

  return {
    valid: result.valid,
    fields,
  };
}
