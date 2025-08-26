import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { cors } from "hono/cors";
import { z } from "zod";
import { sendLongMessageToTelegram } from "./telegram";
import { createApiResponse, extractRequestInfo } from "./utils";

// Types
type Credentials = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  AUTH_KEY?: string;
};

// Validation schemas
const notificationSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(50000, "Message too long"),
  authKey: z.string().min(25, "Auth key too short").max(44, "Auth key too long")
});

// Initialize Hono app
const app = new Hono();

// Apply CORS middleware to all routes
app.use("*", cors());

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    createApiResponse(false, undefined, undefined, "Internal server error"),
    500
  );
});

// Root GET route - sends request information to Telegram
app.get("/", async (c) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = env<Credentials>(c);

  // Extract and format request information
  const requestInfo = extractRequestInfo(c);

  // Send request details to Telegram
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

// POST route for authenticated custom notifications
app.post("/send", zValidator("json", notificationSchema), async (c) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, AUTH_KEY } = env<Credentials>(c);
  const { message, authKey } = c.req.valid("json");

  // Validate authentication
  if (!AUTH_KEY || authKey !== AUTH_KEY) {
    return c.json(
      createApiResponse(false, undefined, undefined, "Unauthorized: Invalid auth key"),
      403
    );
  }

  // Combine user message with request metadata
  const requestInfo = extractRequestInfo(c);
  const combinedMessage = `${ message }\n\n---\nRequest Info:\n${ requestInfo }`;

  // Send to Telegram
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

// 404 handler for undefined routes
app.notFound((c) => {
  return c.json(
    createApiResponse(false, undefined, undefined, "Endpoint not found"),
    404
  );
});

export default app;