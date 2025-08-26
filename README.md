# Serverless Telegram Notifier

Minimal Hono-based Cloudflare Workers service for forwarding HTTP requests to Telegram. Provides two routes:

- **GET `/`** - Sends request information to Telegram (useful for monitoring)
- **POST `/send`** - Sends custom notifications with authentication

## Features

- Automatic message chunking for long messages (4096+ characters)
- Rate limiting compliance with 1-second delays between chunks
- Request metadata logging (IP, headers, timestamp)
- Authentication for custom notifications
- Comprehensive error handling

## Quick Setup

### 1. Create Telegram Bot

- Message [@BotFather](https://t.me/botfather) on Telegram
- Send `/newbot` and follow prompts
- Save your `TELEGRAM_BOT_TOKEN`

### 2. Get Your Chat ID

**Option A: Direct message**

- Send any message to your bot in a private chat
- Open: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
- Look for `"chat":{"id":123456789}` → use that number as `TELEGRAM_CHAT_ID`

**Option B: Group or channel**

- Add your bot to the group/channel
- Send a message in the group
- Call the same `getUpdates` URL
- Copy the `"chat":{"id":-1001234567890}` value (note the minus sign for groups)

### 3. Generate Authentication Key

```bash
openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32
# Example output: yKDVvSgUd2qLVcfGwTaqduFmrFScA5jT
```

### 4. Deploy

```bash
pnpm install
pnpx wrangler secret put TELEGRAM_BOT_TOKEN
pnpx wrangler secret put TELEGRAM_CHAT_ID
pnpx wrangler secret put AUTH_KEY
pnpm run deploy
```

## Usage

### Monitor Requests (GET)

Any GET request to the root endpoint will send request details to Telegram:

```bash
# dev
curl http://localhost:8787/
```

This sends information including:

- Timestamp
- HTTP method and URL
- Client IP address
- Request headers

### Send Custom Notifications (POST)

Send authenticated custom messages:

```bash
curl -X POST http://localhost:8787/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Server deployed successfully!", "authKey": "yKDVvSgUd2qLVcfGwTaqduFmrFScA5jT"}'
```

**Request Body:**

- `message` (string): Your notification message (1-50,000 characters)
- `authKey` (string): Your authentication key (25-44 characters)

## Development

```bash
# Create .dev.vars file with:
# TELEGRAM_BOT_TOKEN=<YOUR_BOT_TOKEN>
# TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>
# AUTH_KEY=<YOUR_AUTH_KEY>

pnpm run dev
```

## API Responses

All endpoints return JSON with this structure:

```javascript
{
  success: boolean;
  message?: string;           // Success message
  error?: string;             // Error description
  data?: {                    // Additional response data
    parts?: number;           // Number of message chunks sent
    messageLength?: number;   // Total message length
  };
}
```

## Error Codes

- `200` - Success
- `403` - Invalid authentication key
- `500` - Internal server error
- `502` - Telegram API error
