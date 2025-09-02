const fs = require('fs');
const path = require('path');

function isDirectory(fullPath) {
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function readFileIfExists(fullPath) {
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

function loadLocalTestsFromDir(rootDir) {
  const entries = fs.readdirSync(rootDir);
  const tests = [];
  for (const entry of entries) {
    const folderPath = path.join(rootDir, entry);
    if (!isDirectory(folderPath)) continue;

    const locustPath = path.join(folderPath, 'locustfile.py');
    const configPath = path.join(folderPath, 'config.json');
    if (!fs.existsSync(locustPath) || !fs.existsSync(configPath)) continue;

    const configRaw = readFileIfExists(configPath);
    let config;
    try {
      config = JSON.parse(configRaw || '{}');
    } catch {
      throw new Error(`Invalid JSON in ${configPath}`);
    }

    const name = entry; // use folder slug as canonical unique name
    const locustfileContent = readFileIfExists(locustPath) || '';

    tests.push({
      folder: entry,
      name,
      config,
      locustfile: locustfileContent,
    });
  }
  return tests;
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

function buildPayloadFromLocal(local, includeExtended, remote, { includeName }) {
  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const base = {
    ...(includeName ? { name: String(local.name) } : {}),
    rate: toNum(local.config.rate),
    servers: toNum(local.config.servers),
    users: toNum(local.config.users),
    // host_id resolved later in pushCommand from config.host
    // For updates, default to remote.region if missing locally
    region: (local.config.region ? String(local.config.region) : (remote && remote.region ? String(remote.region) : undefined)),
    locustfile: local.locustfile,
  };

  if (!includeExtended) return base;

  return {
    ...base,
    apdex_target: toNum(local.config.apdex_target),
    p95_target: toNum(local.config.p95_target),
    error_perc_target: toNum(local.config.error_perc_target),
    region_servers: local.config.region_servers,
  };
}

async function pushCommand({ client, rootDir, allowCreate, allowDelete, dryRun = true, tryExtended = true, verbose = false }) {
  const localTests = loadLocalTestsFromDir(rootDir);
  const remoteAll = await client.listTests();
  const remoteLoad = remoteAll.filter((t) => (t.test_type || 'load') === 'load');

  const remoteByName = new Map();
  for (const t of remoteLoad) {
    if (!t.name) continue;
    remoteByName.set(t.name, t);
  }

  const localNames = new Set(localTests.map((t) => t.name));
  const remoteNames = new Set(remoteLoad.map((t) => t.name).filter(Boolean));

  const toUpdate = localTests.filter((t) => remoteByName.has(t.name));
  const toCreate = localTests.filter((t) => !remoteByName.has(t.name));
  const toDelete = [...remoteNames].filter((name) => !localNames.has(name));

  console.log(`Plan: update=${toUpdate.length}, create=${toCreate.length}, delete=${toDelete.length}`);
  if (dryRun) {
    console.log('(dry-run) No changes will be applied.');
    return;
  }

  // Preload hosts and build lookup
  let hosts = [];
  try {
    hosts = await client.listHosts();
  } catch {
    hosts = [];
  }
  const findOrCreateHostId = async (hostStr) => {
    if (!hostStr) return undefined;
    const parsed = parseHostString(hostStr);
    if (!parsed) return undefined;
    const found = hosts.find((h) => String(h.protocol) === parsed.protocol && String(h.url) === parsed.url && Number(h.port) === parsed.port);
    if (found) return found.id;
    // create host
    const created = await client.createHost({ protocol: parsed.protocol, url: parsed.url, port: parsed.port });
    // Refresh host cache (best effort)
    try { hosts = await client.listHosts(); } catch {}
    return (created && (created.id ?? created.host_id)) || undefined;
  };

  // Updates
  for (const local of toUpdate) {
    const remote = remoteByName.get(local.name);
    // Include name on update as API requires it
    const withExtended = buildPayloadFromLocal(local, tryExtended, remote, { includeName: true });
    // Resolve host_id from config.host if present
    if (local.config.host) {
      withExtended.host_id = await findOrCreateHostId(local.config.host);
    } else if (remote && remote.host_id) {
      withExtended.host_id = remote.host_id;
    }
    if (verbose) {
      console.log(`[DEBUG] update payload for '${local.name}':`, JSON.stringify(withExtended));
    }
    try {
      await client.updateTest(remote.id, withExtended);
      console.log(`Updated test '${local.name}' (id=${remote.id})`);
    } catch (err) {
      if (tryExtended && err?.response?.status === 400) {
        const baseOnly = buildPayloadFromLocal(local, false, remote, { includeName: false });
        if (verbose) {
          console.log(`[DEBUG] retry base payload for '${local.name}':`, JSON.stringify(baseOnly));
        }
        try {
          await client.updateTest(remote.id, baseOnly);
          console.warn(`Updated test '${local.name}' (id=${remote.id}) with base fields only (extended fields not accepted).`);
        } catch (e2) {
          console.error(`[ERROR] base update failed for '${local.name}':`, e2?.response?.data || e2?.message || e2);
          throw e2;
        }
      } else {
        console.error(`[ERROR] update failed for '${local.name}':`, err?.response?.data || err?.message || err);
        throw err;
      }
    }
  }

  // Creates
  for (const local of toCreate) {
    if (!allowCreate) {
      console.warn(`Skipping create for '${local.name}' (use --allow-create to enable).`);
      continue;
    }
    // For create, region must be present locally
    if (!local.config.region) {
      throw new Error(`Create requires 'region' in ${path.join(rootDir, local.folder, 'config.json')}`);
    }
    const withExtended = buildPayloadFromLocal(local, tryExtended, null, { includeName: true });
    if (local.config.host) {
      withExtended.host_id = await findOrCreateHostId(local.config.host);
    }
    if (verbose) {
      console.log(`[DEBUG] create payload for '${local.name}':`, JSON.stringify(withExtended));
    }
    try {
      const res = await client.createTest(withExtended);
      console.log(`Created test '${local.name}' (${JSON.stringify(res)})`);
    } catch (err) {
      if (tryExtended && err?.response?.status === 400) {
        const baseOnly = buildPayloadFromLocal(local, false, null, { includeName: true });
        if (verbose) {
          console.log(`[DEBUG] retry create base payload for '${local.name}':`, JSON.stringify(baseOnly));
        }
        try {
          const res = await client.createTest(baseOnly);
          console.warn(`Created test '${local.name}' with base fields only (extended fields not accepted). (${JSON.stringify(res)})`);
        } catch (e2) {
          console.error(`[ERROR] base create failed for '${local.name}':`, e2?.response?.data || e2?.message || e2);
          throw e2;
        }
      } else {
        console.error(`[ERROR] create failed for '${local.name}':`, err?.response?.data || err?.message || err);
        throw err;
      }
    }
  }

  // Deletes
  if (allowDelete) {
    for (const name of toDelete) {
      const remote = remoteByName.get(name);
      if (!remote) continue;
      await client.deleteTest(remote.id);
      console.log(`Deleted test '${name}' (id=${remote.id})`);
    }
  } else if (toDelete.length > 0) {
    console.warn(`Skipping deletion of ${toDelete.length} test(s) (use --allow-delete to enable).`);
  }
}

module.exports = { pushCommand };


