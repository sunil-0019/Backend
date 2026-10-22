export const RULES = Object.freeze({
  otp: {
    signup: { maxSends: 5, validityMinutes: 10, lockHours: 24, windowHours: 24, maxWrongEntries: 5 },
    login: { maxSends: 5, validityMinutes: 10, lockHours: 24, windowHours: 24, maxWrongEntries: 5 },
    removeDevice: { maxSends: 5, validityMinutes: 10, lockHours: 24, windowHours: 24, maxWrongEntries: 5 },
    removeAllDevices: { maxSends: 5, validityMinutes: 10, lockHours: 24, windowHours: 24, maxWrongEntries: 5 },
    forgotPassword: { maxSends: 5, validityMinutes: 10, lockHours: 24, windowHours: 24, maxWrongEntries: 5 },
    digits: 6,
  },
  userId: {
    min: 8,
    max: 100,
    minEditDistance: 3,
    maxEditsInPeriod: 2, // Maximum 2 edits in 1 month (30 days)
    periodDays: 30,
    reservedDaysAfterChange: 30,
  },
  password: { min: 8, max: 128, generatedLength: 8, requireUpper: true, requireLower: true, requireSpecial: true },
  profile: { nameMax: 50, aboutMax: 139, defaultAbout: 'Hey there, using ChatLeaf' },
  login: { maxWrong: 5, lockMinutes: 15 },
  devices: { maxAllowed: 3, sessionExpiryDays: 90 }, // 3 active devices, 3 months (90 days) sliding window session
});
