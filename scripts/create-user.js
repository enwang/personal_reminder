require('dotenv').config();

const db = require('../server/db');
const { hashPassword } = require('../server/services/passwords');

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npm run create-user -- <username> <password>');
  process.exit(1);
}

(async () => {
  try {
    const existing = await db.getUserByUsername(username);
    if (existing) {
      console.error(`User "${username}" already exists.`);
      process.exitCode = 1;
      return;
    }

    const password_hash = await hashPassword(password);
    const user = await db.createUser({ username, password_hash });
    console.log(`Created user "${user.username}".`);
  } catch (error) {
    console.error('Failed to create user:', error.message);
    process.exitCode = 1;
  } finally {
    db.close(() => {});
  }
})();
