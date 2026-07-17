const crypto = require('crypto');

const KEY_LENGTH = 64;

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });

const verifyPassword = (password, passwordHash) =>
  new Promise((resolve, reject) => {
    const [scheme, salt, storedKey] = String(passwordHash || '').split(':');
    if (scheme !== 'scrypt' || !salt || !storedKey) {
      resolve(false);
      return;
    }

    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }

      const stored = Buffer.from(storedKey, 'hex');
      const candidate = Buffer.from(derivedKey.toString('hex'), 'hex');
      resolve(stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate));
    });
  });

module.exports = {
  hashPassword,
  verifyPassword
};
