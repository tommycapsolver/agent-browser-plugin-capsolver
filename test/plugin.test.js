import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { handlePluginRequest, PROTOCOL } from "../src/plugin.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("returns an agent-browser plugin manifest", async () => {
  const response = await handlePluginRequest({
    protocol: PROTOCOL,
    type: "plugin.manifest",
    capability: "plugin.manifest",
    request: {},
  });

  assert.deepEqual(response, {
    protocol: PROTOCOL,
    success: true,
    manifest: {
      name: "capsolver",
      capabilities: ["command.run", "captcha.solve"],
      description: "Solve supported CAPTCHA challenges through CapSolver",
    },
  });
});

test("rejects an unsupported protocol", async () => {
  const response = await handlePluginRequest({
    protocol: "agent-browser.plugin.v0",
    type: "plugin.manifest",
    request: {},
  });

  assert.equal(response.success, false);
  assert.equal(response.error.code, "UNSUPPORTED_PROTOCOL");
});

test("requires the API key without exposing secrets", async () => {
  const response = await handlePluginRequest(
    {
      protocol: PROTOCOL,
      type: "captcha.solve",
      capability: "captcha.solve",
      request: {
        taskType: "AntiTurnstileTaskProxyLess",
        url: "https://example.com",
        siteKey: "site-key",
      },
    },
    { env: {} },
  );

  assert.equal(response.success, false);
  assert.equal(response.error.code, "MISSING_API_KEY");
  assert.doesNotMatch(JSON.stringify(response), /clientKey/i);
});

test("maps shorthand fields and polls until the task is ready", async () => {
  const calls = [];
  const responses = [
    { errorId: 0, taskId: "task-123", status: "idle" },
    { errorId: 0, taskId: "task-123", status: "processing" },
    { errorId: 0, taskId: "task-123", status: "ready", solution: { token: "token-123" } },
  ];
  let clock = 0;

  const response = await handlePluginRequest(
    {
      protocol: PROTOCOL,
      type: "captcha.solve",
      capability: "captcha.solve",
      request: {
        taskType: "AntiTurnstileTaskProxyLess",
        url: "https://example.com",
        siteKey: "site-key",
        options: { metadata: { action: "login" } },
        pollIntervalMs: 1_000,
      },
    },
    {
      env: { CAPSOLVER_API_KEY: "secret-key", CAPSOLVER_APP_ID: "app-id" },
      fetchImpl: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return jsonResponse(responses.shift());
      },
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      now: () => clock,
    },
  );

  assert.equal(response.success, true);
  assert.deepEqual(response.data, {
    provider: "capsolver",
    taskId: "task-123",
    status: "ready",
    solution: { token: "token-123" },
  });
  assert.deepEqual(calls[0], {
    url: "https://api.capsolver.com/createTask",
    body: {
      clientKey: "secret-key",
      appId: "app-id",
      task: {
        metadata: { action: "login" },
        type: "AntiTurnstileTaskProxyLess",
        websiteURL: "https://example.com",
        websiteKey: "site-key",
      },
    },
  });
  assert.equal(calls[1].url, "https://api.capsolver.com/getTaskResult");
  assert.equal(calls[2].body.taskId, "task-123");
});

test("passes a full CapSolver task through unchanged", async () => {
  const task = {
    type: "ReCaptchaV3TaskProxyLess",
    websiteURL: "https://example.com/login",
    websiteKey: "site-key",
    pageAction: "login",
    minScore: 0.7,
  };
  let sentTask;

  const response = await handlePluginRequest(
    {
      protocol: PROTOCOL,
      type: "captcha.solve",
      capability: "captcha.solve",
      request: { task },
    },
    {
      env: { CAPSOLVER_API_KEY: "secret-key" },
      fetchImpl: async (_url, options) => {
        sentTask = JSON.parse(options.body).task;
        return jsonResponse({
          errorId: 0,
          status: "ready",
          taskId: "sync-task",
          solution: { gRecaptchaResponse: "response-token" },
        });
      },
    },
  );

  assert.deepEqual(sentTask, task);
  assert.equal(response.success, true);
  assert.equal(response.data.solution.gRecaptchaResponse, "response-token");
});

test("returns a structured CapSolver API error", async () => {
  const response = await handlePluginRequest(
    {
      protocol: PROTOCOL,
      type: "captcha.solve",
      capability: "captcha.solve",
      request: {
        task: {
          type: "AntiTurnstileTaskProxyLess",
          websiteURL: "https://example.com",
          websiteKey: "site-key",
        },
      },
    },
    {
      env: { CAPSOLVER_API_KEY: "secret-key" },
      fetchImpl: async () =>
        jsonResponse({
          errorId: 1,
          errorCode: "ERROR_TASK_DATA",
          errorDescription: "invalid task data",
        }),
    },
  );

  assert.deepEqual(response.error, {
    code: "ERROR_TASK_DATA",
    error: "invalid task data",
  });
  assert.doesNotMatch(JSON.stringify(response), /secret-key/);
});

test("CLI reads one request and writes one JSON response", async () => {
  const child = spawn(process.execPath, ["bin/plugin.js"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stdin.end(
    JSON.stringify({
      protocol: PROTOCOL,
      type: "plugin.manifest",
      capability: "plugin.manifest",
      request: {},
    }),
  );
  const [exitCode] = await once(child, "exit");

  assert.equal(exitCode, 0);
  const response = JSON.parse(Buffer.concat(stdout).toString("utf8"));
  assert.equal(response.manifest.name, "capsolver");
});
