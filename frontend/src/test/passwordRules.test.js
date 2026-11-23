import { describe, expect, it } from 'vitest';
import { byteLength, passwordRules, passwordValid } from '../auth/passwordRules.js';

describe('password rules match the server', () => {
  it.each([
    ['Heart1234', true],
    ['short1A', false], // 7 characters
    ['12345678', false], // no letter
    ['abcdefgh', false], // no number
    ['पासवर्ड१२३४५', true], // Marathi letters and digits
    ['密码密码密码密码1', true],
    [`${'a'.repeat(71)}1`, true], // exactly 72 bytes
    [`${'a'.repeat(72)}1`, false], // 73 bytes
    [`${'é'.repeat(40)}1`, false], // 81 bytes
  ])('%s -> %s', (password, expected) => {
    expect(passwordValid(password)).toBe(expected);
  });

  it('counts bytes, not characters', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('प')).toBe(3);
  });

  it('only shows the byte rule once it is broken', () => {
    const byteRule = passwordRules.find((r) => r.onlyWhenBroken);
    expect(byteRule.ok('Heart1234')).toBe(true);
    expect(byteRule.ok('a'.repeat(80))).toBe(false);
  });
});
