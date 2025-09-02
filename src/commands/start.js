async function startRunBySlug({ client, slug, duration = 5, verbose = false }) {
  if (!slug) throw new Error('Slug (test name) is required');
  const tests = await client.listTests();
  const loadTests = tests.filter((t) => (t.test_type || 'load') === 'load');
  const match = loadTests.find((t) => t.name === slug);
  if (!match) {
    throw new Error(`No load test found with name '${slug}'`);
  }
  const res = await client.startRun({ test_id: match.id, duration });
  if (verbose) {
    console.log('[DEBUG] start run response:', JSON.stringify(res));
  }
  const runId = (res && (res.run_id ?? res.result_id ?? (res.run && res.run.id) ?? res.id));
  if (typeof runId === 'undefined') {
    throw new Error('Unexpected response from start run');
  }
  console.log(String(runId));
}

module.exports = { startRunBySlug };


