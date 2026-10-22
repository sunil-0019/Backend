export default {
  order: 30,
  name: 'NEED_LOWER',
  check(value) {
    if (!/[a-z]/.test(value)) {
      return { valid: false, error: 'NEED_LOWER', message: 'Password must contain at least 1 lowercase letter' };
    }
    return { valid: true };
  }
};
