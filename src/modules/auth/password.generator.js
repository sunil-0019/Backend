import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIALS = '@#$%&*!?';
const ALL_CHARS = UPPER + LOWER + DIGITS + SPECIALS;

export function generatePassword() {
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SPECIALS[randomInt(SPECIALS.length)],
    ALL_CHARS[randomInt(ALL_CHARS.length)],
    ALL_CHARS[randomInt(ALL_CHARS.length)],
    ALL_CHARS[randomInt(ALL_CHARS.length)],
    ALL_CHARS[randomInt(ALL_CHARS.length)],
  ];

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
