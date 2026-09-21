# agent-browser-plugin-capsolver

An out-of-process [agent-browser](https://github.com/vercel-labs/agent-browser) plugin that sends supported CAPTCHA tasks to the CapSolver API and returns the structured solution to the caller.

The plugin implements the `agent-browser.plugin.v1` protocol and the custom `captcha.solve` capability. It does not control the browser, inject tokens, handle sign-in credentials, or automate 2FA, payments, consent, or identity verification. Use it only for websites and workflows you are authorized to automate.

## Install

Add the GitHub-hosted plugin to the current project:

```bash
agent-browser plugin add tommycapsolver/agent-browser-plugin-capsolver
```

Set the API key in the environment that runs agent-browser:

```bash
export CAPSOLVER_API_KEY="your-api-key"
```

`CAPSOLVER_APP_ID` is optional.

Confirm that the manifest was discovered:

```bash
agent-browser plugin show capsolver
```

## Use a full CapSolver task

Passing a full task object is the most flexible option and matches the CapSolver API documentation:

```bash
agent-browser plugin run capsolver captcha.solve --payload '{
  "task": {
    "type": "AntiTurnstileTaskProxyLess",
    "websiteURL": "https://example.com",
    "websiteKey": "site-key"
  }
}'
```

The plugin calls `createTask`, polls `getTaskResult` for asynchronous tasks, and returns the complete `solution` object:

```json
{
  "provider": "capsolver",
  "taskId": "task-id",
  "status": "ready",
  "solution": {
    "token": "solution-token"
  }
}
```

## Use shorthand fields

For task types that use a page URL and site key, the plugin also accepts shorthand fields:

```bash
agent-browser plugin run capsolver captcha.solve --payload '{
  "taskType": "AntiTurnstileTaskProxyLess",
  "url": "https://example.com",
  "siteKey": "site-key"
}'
```

Additional CapSolver task fields can be placed in `options`:

```json
{
  "taskType": "ReCaptchaV3TaskProxyLess",
  "url": "https://example.com/login",
  "siteKey": "site-key",
  "options": {
    "pageAction": "login",
    "minScore": 0.7
  }
}
```

The plugin does not infer a task type. Select the appropriate task type and parameters from the [CapSolver documentation](https://docs.capsolver.com/en/guide/).

## Timeouts

The default overall timeout is 120 seconds and the default polling interval is 3 seconds. Both may be changed per request:

```json
{
  "task": {
    "type": "AntiTurnstileTaskProxyLess",
    "websiteURL": "https://example.com",
    "websiteKey": "site-key"
  },
  "timeoutMs": 180000,
  "pollIntervalMs": 3000
}
```

`timeoutMs` must be between 1,000 and 300,000. `pollIntervalMs` must be between 1,000 and 10,000.

## Security and workflow boundaries

- The API key is read only from `CAPSOLVER_API_KEY` and is never accepted as a command argument or request payload.
- The plugin writes exactly one JSON response to stdout and does not log secrets.
- The CapSolver API endpoint is fixed to `https://api.capsolver.com`.
- The plugin returns data to agent-browser but does not apply a solution to a page.
- Keep 2FA, payment authorization, consent, account recovery, and identity verification under manual user control.
- Preserve agent-browser policy controls and human handoff as the fallback.

## Development

Requires Node.js 20 or newer.

```bash
npm test
npm run check
```

The package has no runtime dependencies.

## License

MIT
