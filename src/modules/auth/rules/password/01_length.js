export default {
  order: 10,
  name: 'NEED_LENGTH',
  check(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
      return { valid: false, error: 'NEED_LENGTH', message: 'Password must be between 8 and 128 characters' };
    }
    return { valid: true };
  }
};
