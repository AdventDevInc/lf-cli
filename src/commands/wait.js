async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusToText(code) {
  const map = {
    0: 'Queued',
    1: 'Provisioning',
    2: 'Running',
    3: 'Completed',
    4: 'Failed to launch',
    5: 'Cancelled',
    6: 'Provider limited',
    7: "Workers failed to launch",
  };
  return typeof code === 'number' ? (map[code] || `Status ${code}`) : 'Unknown';
}

function renderLiveLine({ frame, status, res }) {
  const parts = [];
  parts.push(`[${frame}] ${statusToText(status)}`);
  if (res) {
    if (res.requests !== undefined) parts.push(`reqs=${res.requests}`);
    if (res.failures !== undefined) parts.push(`fails=${res.failures}`);
    if (res.reqs_per_second !== undefined) parts.push(`rps=${res.reqs_per_second}`);
    if (res.fails_per_second !== undefined) parts.push(`fps=${res.fails_per_second}`);
    if (res.response_avg !== undefined) parts.push(`avg=${res.response_avg}ms`);
    if (res.response_median !== undefined) parts.push(`p50=${res.response_median}ms`);
  }
  return parts.join('  ');
}

async function waitForResult({ client, id, intervalMs = 5000, verbose = false }) {
  if (!id) throw new Error('Result id is required');
  // Poll until run_status >= 3, updating a live spinner/status line
  const frames = ['|', '/', '-', '\\'];
  let frameIdx = 0;
  for (;;) {
    const res = await client.getResult(id);
    if (verbose) {
      console.log('[DEBUG] result:', JSON.stringify(res));
    }
    const status = res && (res.run_status ?? res.status ?? res.state);

    const summary = {
      id: res?.id,
      created_at: res?.created_at,
      updated_at: res?.updated_at,
      run_status: status,
      cancelled: res?.cancelled,
      duration: res?.duration,
      test_id: res?.test_id,
      requests: res?.requests,
      failures: res?.failures,
      response_median: res?.response_median,
      response_avg: res?.response_avg,
      response_min: res?.response_min,
      response_max: res?.response_max,
      reqs_per_second: res?.reqs_per_second,
      fails_per_second: res?.fails_per_second,
    };

    // Render immediate status line
    const line = renderLiveLine({ frame: frames[frameIdx % frames.length], status, res });
    process.stderr.write(`\r${line}`);

    if (typeof status === 'number' && status >= 3) {
      process.stderr.write('\n');
      if (status === 3) {
        // Completed; inspect run_passed for final exit code
        const runPassed = Boolean(res?.run_passed);
        if (runPassed) {
          console.log('Run completed successfully');
          console.log(JSON.stringify(summary));
          process.exit(0);
        } else {
          console.error('Run passed was false');
          console.error('Run did not pass. This is based on your apdex score, error percentage target and p95 target');
          console.log(JSON.stringify(summary));
          process.exit(2);
        }
      }

      const explanations = {
        4: "The Run failed to launch",
        5: "The Run was cancelled",
        6: "The Run was limited by your cloud provider",
        7: "The Run failed to launch it's cloud workers",
      };
      console.error('Run failed to execute');
      if (explanations[status]) {
        console.error(explanations[status]);
      }
      console.log(JSON.stringify(summary));
      process.exit(1);
    }

    // Animate spinner while waiting for next poll
    const tickEvery = 120; // ms
    const endAt = Date.now() + intervalMs;
    while (Date.now() < endAt) {
      await sleep(tickEvery);
      frameIdx += 1;
      const spinLine = renderLiveLine({ frame: frames[frameIdx % frames.length], status, res });
      process.stderr.write(`\r${spinLine}`);
    }
  }
}

module.exports = { waitForResult };


