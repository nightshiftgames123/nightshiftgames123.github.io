# SafePlate AI server

A small Cloudflare Worker that lets SafePlate's AI chef and label scanner work without each user
creating their own Gemini key.

- It keeps one Gemini key on the server.
- Each device gets a few free AI uses a day (`DAILY_FREE`, default 5). A chat message or a label scan is one use.
- `DAILY_TOTAL` is the spending limit: when that many uses have been made by everyone in one day, the free AI pauses until tomorrow.
- People who add their own Gemini key in the app skip this server and have no limit.
- It has no accounts and stores no chats or photos. It only keeps today's counters, which are wiped each day.

The app does not use this server until its address is put into `AI_SERVER` in `safeplate/index.html`.

## Setting it up (once)

1. **Get a Gemini key on the paid tier.** In Google AI Studio, create an API key in a project with billing turned on.
   On the paid tier Google does not use what users send to train its models. Set a monthly budget alert in Google Cloud.
2. **Create a free Cloudflare account** at cloudflare.com.
3. **Create the Worker from this repository.** In the Cloudflare dashboard open *Workers & Pages*, choose *Create application*,
   pick *GitHub*, and select this repository. Set:
   - Project name: `safeplate-ai` (it must match `name` in `wrangler.toml`)
   - Root directory: `safeplate-server`
   - Leave the build command empty and the deploy command as `npx wrangler deploy`
4. **Add the key as a secret.** Open the new Worker, go to *Settings → Variables and Secrets*, add a secret named
   `GEMINI_API_KEY` and paste the key. Do not put the key in any file in this repository.
5. **Copy the Worker's address.** It looks like `https://safeplate-ai.<your-name>.workers.dev`.
   Put it in `AI_SERVER` in `safeplate/index.html` and update the privacy policy (see below).

After that, every change to this folder on the `main` branch is deployed automatically.

## Changing the limits

Edit the numbers in `wrangler.toml` and push. Rough cost guide: one use costs well under one US cent,
so `DAILY_TOTAL = "1500"` caps spending at a few dollars a day at most.

## When the server goes live, the privacy policy must say

- AI requests go through SafePlate's server on Cloudflare, then to Google Gemini. The server does not keep them.
- The app creates a random device ID to count free uses. The server also counts uses per IP address, stored only
  as a one-way hash and deleted each day.

## Testing locally

```
npx wrangler dev --var GEMINI_API_KEY:<key> --var ALLOWED_ORIGINS:http://localhost:8765
```
