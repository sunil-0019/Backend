const RESERVED = new Set([
  'admin', 'administrator', 'support', 'chatleaf', 'root', 'system',
  'official', 'help', 'security', 'moderator', 'chat', 'leaf', 'bot',
  'api', 'auth', 'null', 'undefined', 'contact', 'billing', 'terms'
]);

export default {
  order: 20,
  name: 'USER_ID_RESERVED',
  abortOnFail: true,
  check(value) {
    const id = value.toLowerCase().trim();
    if (RESERVED.has(id)) {
      return { valid: false, error: 'USER_ID_RESERVED', message: 'This User ID is reserved' };
    }
    for (const res of RESERVED) {
      if (id === res || id.startsWith(`${res}_`) || id.endsWith(`_${res}`)) {
        return { valid: false, error: 'USER_ID_RESERVED', message: 'This User ID is reserved' };
      }
    }
    return { valid: true };
  }
};
