const BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'porn', 'nude', 'dick', 'pussy'];

export default {
  order: 30,
  name: 'USER_ID_PROFANITY',
  abortOnFail: true,
  check(value) {
    const id = value.toLowerCase().trim();
    for (const word of BAD_WORDS) {
      if (id.includes(word)) {
        return { valid: false, error: 'USER_ID_PROFANITY', message: 'User ID contains disallowed words' };
      }
    }
    return { valid: true };
  }
};
