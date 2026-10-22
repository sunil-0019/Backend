import fs from 'fs';
import path from 'path';

export async function loadRulePipeline(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
  const rules = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const fileUrl = new URL(`file:///${filePath.replace(/\\/g, '/')}`).href;
    const module = await import(fileUrl);
    const rule = module.default;
    if (rule && typeof rule.check === 'function') {
      rules.push(rule);
    }
  }

  // Sort by order ascending
  rules.sort((a, b) => (a.order || 50) - (b.order || 50));
  return rules;
}

export async function executeRulePipeline(rules, value, ctx = {}) {
  const errors = [];
  for (const rule of rules) {
    const res = await rule.check(value, ctx);
    if (res && res.valid === false) {
      errors.push({
        rule: rule.name,
        error: res.error || rule.name,
        message: res.message || 'Validation failed',
      });
      // If rule is marked as fatal / abortOnFail, stop evaluating further
      if (rule.abortOnFail) {
        break;
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}
