export default {
  order: 10,
  name: 'USER_ID_FORMAT',
  abortOnFail: true,
  check(value) {
    if (typeof value !== 'string') {
      return { valid: false, error: 'USER_ID_FORMAT', message: 'User ID must be a string' };
    }
    const id = value.toLowerCase().trim();
    if (id.length < 8 || id.length > 100) {
      return { valid: false, error: 'USER_ID_FORMAT', message: 'User ID must be between 8 and 100 characters' };
    }
    if (!/^[a-z][a-z0-9_@#$]*$/.test(id)) {
      return { valid: false, error: 'USER_ID_FORMAT', message: 'User ID must start with a lowercase letter and contain only lowercase letters, numbers, and allowed characters (@, #, $, _)' };
    }
    return { valid: true };
  }
};
