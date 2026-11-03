/**
 * Tests for OTP SMS message templates in otpService.js
 *
 * Validates that all templates use pure ASCII characters so that AWS SNS
 * uses GSM-7 encoding (160 chars/SMS, 1 part) instead of UCS-2 (70 chars/SMS, 2 parts).
 */

const { buildOtpMessage } = require('../otpService');

const ASCII_REGEX = /^[\x00-\x7F]*$/;
const PURPOSES = ['register', 'reset', 'change-password', 'login', 'withdraw', 'unknown'];
const SAMPLE_CODE = '123456';

describe('OTP SMS message templates', () => {
  test.each(PURPOSES)(
    'purpose "%s": message is ASCII-only, ≤160 chars, and contains required strings',
    (purpose) => {
      const message = buildOtpMessage(purpose, SAMPLE_CODE);

      expect(ASCII_REGEX.test(message)).toBe(true);
      expect(message.length).toBeLessThanOrEqual(160);
      expect(message).toContain(SAMPLE_CODE);
      // #1021: marca del sitio (PICA ROJA) y sin links ni dominios partidos para esquivar filtros.
      expect(message.startsWith('PICA ROJA: ')).toBe(true);
      expect(message).not.toMatch(/\.com|https?:|www/i);
    }
  );
});
