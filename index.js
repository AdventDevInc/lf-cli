#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const { loadEnv } = require('./src/config');
const { createLoadForgeClient } = require('./src/api');
const { pullCommand } = require('./src/commands/pull');
const { pushCommand } = require('./src/commands/push');
const { startRunBySlug } = require('./src/commands/start');
const { waitForResult } = require('./src/commands/wait');
const { createTestCommand } = require('./src/commands/create');

async function main() {
  loadEnv();

  const program = new Command();
  program
    .name('lf-cli')
    .description('CLI helper for LoadForge')
    .version('1.0.0');

  program
    .command('pull')
    .description('Pull all LoadForge test scripts (locustfiles)')
    .option('-o, --out <dir>', 'Output directory', 'tests')
    .action(async (opts) => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('Missing API_KEY in environment (.env)');
        process.exit(1);
      }

      const client = createLoadForgeClient({ apiKey });
      const outDir = path.resolve(process.cwd(), opts.out || '.');
      await pullCommand({ client, outDir });
    });

  program
    .command('push')
    .description('Push local test folders to LoadForge by unique name')
    .option('--dir <dir>', 'Directory to scan', 'tests')
    .option('--dry-run', 'Show plan only', false)
    .option('--allow-create', 'Create tests that do not exist remotely', false)
    .option('--allow-delete', 'Delete remote tests not present locally', false)
    .option('--try-extended', 'Try to send extended fields (fallback on 400)', true)
    .option('--verbose', 'Enable verbose debug logging', false)
    .action(async (opts) => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('Missing API_KEY in environment (.env)');
        process.exit(1);
      }
      const client = createLoadForgeClient({ apiKey });
      const rootDir = require('path').resolve(process.cwd(), opts.dir || '.');
      await pushCommand({
        client,
        rootDir,
        dryRun: !!opts.dryRun,
        allowCreate: !!opts.allowCreate,
        allowDelete: !!opts.allowDelete,
        tryExtended: opts.tryExtended !== false,
        verbose: !!opts.verbose,
      });
    });

  program
    .command('start <slug>')
    .description('Start a run by test slug (name). Prints run_id to stdout')
    .option('-d, --duration <mins>', 'Duration in minutes (2-720)', '5')
    .option('--verbose', 'Enable verbose debug logging', false)
    .action(async (slug, opts) => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('Missing API_KEY in environment (.env)');
        process.exit(1);
      }
      const client = createLoadForgeClient({ apiKey });
      const duration = Math.max(2, Math.min(720, Number(opts.duration || 5)));
      await startRunBySlug({ client, slug, duration, verbose: !!opts.verbose });
    });

  program
    .command('wait <id>')
    .description('Wait for a run/result to finish; exits 0 on success, 1 on failure')
    .option('-i, --interval <seconds>', 'Polling interval seconds', '5')
    .option('--verbose', 'Enable verbose debug logging', false)
    .action(async (id, opts) => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('Missing API_KEY in environment (.env)');
        process.exit(1);
      }
      const client = createLoadForgeClient({ apiKey });
      const intervalMs = Math.max(1, Number(opts.interval || '5')) * 1000;
      await waitForResult({ client, id, intervalMs, verbose: !!opts.verbose });
    });

  program
    .command('create')
    .description('Create a new test folder under tests/ with config and locustfile')
    .option('-n, --name <slug>', 'Test name (slug)')
    .option('-u, --users <num>', 'Users (number)')
    .option('--host <host>', 'Host as protocol://url:port')
    .option('-o, --out <dir>', 'Output directory', 'tests')
    .action(async (opts) => {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        console.error('Missing API_KEY in environment (.env)');
        process.exit(1);
      }
      const client = createLoadForgeClient({ apiKey });
      await createTestCommand({
        client,
        outDir: opts.out,
        name: opts.name,
        users: opts.users,
        host: opts.host,
      });
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});