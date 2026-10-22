export default {
  order: 20,
  name: 'NEED_CAPITAL',
  check(value) {
    if (!/[A-Z]/.test(value)) {
      return { valid: false, error: 'NEED_CAPITAL', message: 'Password must contain at least 1 capital letter' };
    }
    return { valid: true };
  }
};
