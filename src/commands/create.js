const fs = require('fs');
const path = require('path');
const readline = require('readline');

function sanitizeSlug(name) {
  return String(name)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 64);
}

function parseHostString(hostStr) {
  if (!hostStr || typeof hostStr !== 'string') return null;
  try {
    const u = new URL(hostStr);
    const protocol = u.protocol.replace(':', '');
    const url = u.hostname;
    const port = u.port ? Number(u.port) : (protocol === 'https' ? 443 : 80);
    if (!protocol || !url || !port) return null;
    return { protocol, url, port };
  } catch {
    return null;
  }
}

const DEFAULT_LOCUSTFILE = `from locust import HttpUser, task, between

class QuickstartUser(HttpUser):
    # Wait between 7 and 15 seconds per request per user
    wait_time = between(7, 15)

    # Timeout waiting for a reply in 10 seconds
    network_timeout = 10.0

    # Timeout waiting to connect in 5 seconds
    connection_timeout = 5.0

    @task(1)
    def index_page(self):
        # Request / on your Host
        self.client.get("/")
`;

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function selectHostInteractively({ client }) {
  const hosts = await client.listHosts();
  const items = hosts.map((h, idx) => ({
    index: idx + 1,
    id: h.id,
    protocol: String(h.protocol || ''),
    url: String(h.url || ''),
    port: Number(h.port),
  }));
  console.log('Select a host:');
  for (const it of items) {
    console.log(`${it.index}) ${it.protocol}://${it.url}:${it.port}`);
  }
  const createIdx = items.length + 1;
  console.log(`${createIdx}) Create new host`);
  const choiceStr = await prompt('Enter choice number: ');
  const choice = Number(choiceStr);
  if (choice === createIdx) {
    const protocol = (await prompt('Protocol (http/https): ')).trim() || 'https';
    const url = (await prompt('Hostname (e.g., example.com): ')).trim();
    const portStr = (await prompt('Port (e.g., 443): ')).trim();
    const port = Number(portStr || (protocol === 'https' ? 443 : 80));
    if (!protocol || !url || !port) throw new Error('Invalid host details');
    const created = await client.createHost({ protocol, url, port });
    const hostStr = `${protocol}://${url}:${port}`;
    return hostStr;
  }
  const selected = items.find((it) => it.index === choice);
  if (!selected) throw new Error('Invalid selection');
  return `${selected.protocol}://${selected.url}:${selected.port}`;
}

async function createTestCommand({ client, outDir = 'tests', name, users, host }) {
  let finalName = name;
  if (!finalName) {
    finalName = (await prompt('Test name (slug): ')).trim();
  }
  if (!finalName) throw new Error('Name is required');
  const slug = sanitizeSlug(finalName);

  let finalUsers = users;
  if (finalUsers === undefined || finalUsers === null || finalUsers === '') {
    const ans = await prompt('Users (number): ');
    finalUsers = Number(ans);
  }
  if (!Number.isFinite(Number(finalUsers))) throw new Error('Users must be a number');

  let finalHost = host;
  if (!finalHost) {
    // Try interactive selection
    try {
      finalHost = await selectHostInteractively({ client });
    } catch (e) {
      // Fallback: manual
      const manual = await prompt('Host (protocol://url:port): ');
      finalHost = manual.trim();
    }
  }
  const parsed = parseHostString(finalHost);
  if (!parsed) throw new Error('Host must be protocol://url:port');

  const testFolder = path.resolve(process.cwd(), outDir, slug);
  await fs.promises.mkdir(testFolder, { recursive: true });

  const config = {
    users: Number(finalUsers),
    rate: 1,
    servers: 1,
    host: `${parsed.protocol}://${parsed.url}:${parsed.port}`,
  };
  const configPath = path.join(testFolder, 'config.json');
  const locustPath = path.join(testFolder, 'locustfile.py');

  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  await fs.promises.writeFile(locustPath, DEFAULT_LOCUSTFILE, 'utf8');

  console.log(`Created ${path.relative(process.cwd(), testFolder)}`);
}

module.exports = { createTestCommand };


