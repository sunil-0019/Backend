export default {
  order: 50,
  name: 'NOT_USER_INFO',
  check(value, ctx = {}) {
    if (ctx.userId && value.toLowerCase().includes(ctx.userId.toLowerCase())) {
      return { valid: false, error: 'PASSWORD_CONTAINS_USER_ID', message: 'Password cannot contain your User ID' };
    }
    if (ctx.email) {
      const emailName = ctx.email.split('@')[0];
      if (emailName && emailName.length >= 3 && value.toLowerCase().includes(emailName.toLowerCase())) {
        return { valid: false, error: 'PASSWORD_CONTAINS_EMAIL_NAME', message: 'Password cannot contain your email username' };
      }
    }
    if (ctx.currentPassword && value === ctx.currentPassword) {
      return { valid: false, error: 'PASSWORD_SAME_AS_CURRENT', message: 'New password cannot be the same as current password' };
    }
    return { valid: true };
  }
};
