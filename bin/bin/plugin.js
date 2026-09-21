#!/usr/bin/env node

import { handlePluginRequest, pluginErrorResponse } from "../src/plugin.js";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

let response;
try {
  const raw = Buffer.concat(chunks).toString("utf8");
  const input = JSON.parse(raw);
  response = await handlePluginRequest(input);
} catch (error) {
  response = pluginErrorResponse(error);
}

process.stdout.write(JSON.stringify(response));
