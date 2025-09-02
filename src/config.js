const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const opts = { quiet: true };
  if (fs.existsSync(envPath)) {
    dotenv.config({ ...opts, path: envPath });
  } else {
    dotenv.config(opts);
  }
}

module.exports = { loadEnv };


