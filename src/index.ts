// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { cors } from "hono/cors";
import { notificationHeaderSchema, notificationJSONSchema, pingSchema } from './schemas';
import { sendLongMessageToTelegram } from "./telegram";
import { createApiResponse, extractRequestInfo } from "./utils";

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

type Credentials = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  AUTH_KEY?: string;
  BOT_BYPASS_KEY?: string;
};

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

const app = new Hono();

app.use("*", cors());

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    createApiResponse(false, undefined, undefined, "Internal server error"),
    500
  );
});

app.notFound((c) => {
  return c.json(
    createApiResponse(false, undefined, undefined, "Endpoint not found"),
    404
  );
});

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

app.get("/ping", zValidator('query', pingSchema), async (c) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BOT_BYPASS_KEY } = env<Credentials>(c);

  // This "filter" query parameter is used to reduce noise from bots and crawlers.
  // It's not a secret or authentication key, just a simple way to ignore
  // unwanted automatic requests. Anyone who knows it can still trigger
  // notifications; its purpose is purely to mitigate spam from automated traffic.
  const { key } = c.req.valid("query");

  if (!BOT_BYPASS_KEY || key !== BOT_BYPASS_KEY) {
    return c.json(
      createApiResponse(false, undefined, undefined, "Unauthorized: Invalid bot bypass key"),
      403
    );
  }

  const requestInfo = extractRequestInfo(c);

  const sendResult = await sendLongMessageToTelegram(requestInfo, {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  });

  if (!sendResult.success) {
    return c.json(
      createApiResponse(false, undefined, undefined, sendResult.error),
      502 // Bad Gateway - external service (Telegram) failed
    );
  }

  return c.json(
    createApiResponse(true, "Request information sent successfully", {
      parts: sendResult.sentParts || 1,
    })
  );
});

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

app.post("/send", zValidator("json", notificationJSONSchema), zValidator('header', notificationHeaderSchema), async (c) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, AUTH_KEY } = env<Credentials>(c);
  const { message } = c.req.valid("json");
  const { Authorization: authKey } = c.req.valid("header");

  if (!AUTH_KEY || authKey.replace('Bearer ', '') !== AUTH_KEY) {
    return c.json(
      createApiResponse(false, undefined, undefined, "Unauthorized: Invalid authorization key"),
      403
    );
  }

  const requestInfo = extractRequestInfo(c);
  const combinedMessage = `${ message }\n\n---\nRequest Info:\n${ requestInfo }`;

  const sendResult = await sendLongMessageToTelegram(combinedMessage, {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  });

  if (!sendResult.success) {
    return c.json(
      createApiResponse(false, undefined, undefined, sendResult.error),
      502 // Bad Gateway - external service (Telegram) failed
    );
  }

  return c.json(
    createApiResponse(true, "Notification sent successfully", {
      parts: sendResult.sentParts || 1,
      messageLength: combinedMessage.length,
    })
  );
});

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

export default app;

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->