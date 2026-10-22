export default {
  order: 40,
  name: 'NEED_SPECIAL',
  check(value) {
    if (!/[^A-Za-z0-9\s]/.test(value)) {
      return { valid: false, error: 'NEED_SPECIAL', message: 'Password must contain at least 1 special character' };
    }
    return { valid: true };
  }
};
