const axios = require('axios');

const DEFAULT_BASE_URL = 'https://app.loadforge.com/api/v2';

function createLoadForgeClient({ apiKey, baseURL = DEFAULT_BASE_URL, timeoutMs = 30000 } = {}) {
  if (!apiKey) {
    throw new Error('API key is required to create the LoadForge client');
  }

  const http = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'lf-cli/1.0.0',
      Accept: 'application/json',
    },
  });

  return {
    async listTests() {
      // https://docs.loadforge.com/api-reference/endpoint/tests-list
      const response = await http.get('/tests');
      if (!Array.isArray(response.data)) {
        throw new Error('Unexpected response format from LoadForge /tests');
      }
      return response.data;
    },
    async updateTest(testId, payload) {
      // https://docs.loadforge.com/api-reference/endpoint/tests-update
      const response = await http.patch(`/tests/${testId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    },
    async createTest(payload) {
      // POST Create Test (documented alongside tests API)
      const response = await http.post('/tests', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    },
    async deleteTest(testId) {
      const response = await http.delete(`/tests/${testId}`);
      return response.data;
    },
    async listHosts() {
      // https://docs.loadforge.com/api-reference/endpoint/hosts-list
      const response = await http.get('/hosts');
      if (!Array.isArray(response.data)) {
        throw new Error('Unexpected response format from LoadForge /hosts');
      }
      return response.data;
    },
    async createHost(payload) {
      // POST Create Host
      const response = await http.post('/hosts', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    },
    async startRun({ test_id, duration }) {
      // https://docs.loadforge.com/api-reference/endpoint/run-start
      const response = await http.post('/run', { test_id, duration }, {
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    },
    async getResult(resultId) {
      // https://docs.loadforge.com/api-reference/endpoint/result-get
      const response = await http.get(`/result/${resultId}`);
      return response.data;
    },
  };
}

module.exports = { createLoadForgeClient };


