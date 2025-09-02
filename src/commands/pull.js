const fs = require('fs');
const path = require('path');

function sanitizeFileName(name) {
  return String(name)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 64);
}

async function pullCommand({ client, outDir }) {
  await fs.promises.mkdir(outDir, { recursive: true });

  const tests = await client.listTests();
  if (!tests.length) {
    console.log('No tests found.');
    return;
  }

  const loadTests = tests.filter((t) => (t.test_type || 'load') === 'load');
  const skipped = tests.length - loadTests.length;

  // Fetch hosts to map host_id -> host string
  let hostsIndex = new Map();
  try {
    const hosts = await client.listHosts();
    for (const h of hosts) {
      const protocol = (h.protocol || '').toString().trim();
      const url = (h.url || '').toString().trim();
      const port = typeof h.port === 'number' ? h.port : Number(h.port);
      const hostStr = protocol && url && port ? `${protocol}://${url}:${port}` : undefined;
      hostsIndex.set(h.id, hostStr);
    }
  } catch {
    // ignore host fetch errors; we'll just omit host string
  }

  let written = 0;
  for (const test of loadTests) {
    const id = test.id;
    const name = sanitizeFileName(test.name || `test_${id}`);
    const slugFolder = `${name}`;
    const testFolder = path.join(outDir, slugFolder);
    await fs.promises.mkdir(testFolder, { recursive: true });

    const locustfile = test.locustfile || '';
    const locustPath = path.join(testFolder, 'locustfile.py');
    await fs.promises.writeFile(locustPath, locustfile, 'utf8');

    const config = {
      users: test.users,
      rate: test.rate,
      servers: test.servers,
      host: hostsIndex.get(test.host_id),
      apdex_target: test.apdex_target,
      p95_target: test.p95_target,
      error_perc_target: test.error_perc_target,
      region_servers: test.region_servers,
    };
    const configPath = path.join(testFolder, 'config.json');
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

    written += 1;
    console.log(`Saved ${path.join(slugFolder, 'locustfile.py')} and config.json`);
  }

  console.log(`Done. Wrote ${written} test folder(s) to ${outDir}${skipped ? ` (skipped ${skipped} non-load test(s))` : ''}`);
}

module.exports = { pullCommand };


