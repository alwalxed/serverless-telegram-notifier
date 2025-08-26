// Types
type TelegramApiResponse = {
  ok: boolean;
  result?: unknown;
  description?: string;
};

type TelegramCredentials = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
};

type TelegramSendResult = {
  success: boolean;
  error?: string;
  sentParts?: number;
};

// Constants
const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const MESSAGE_CHUNK_PADDING = 100; // Safety buffer for part headers
const RATE_LIMIT_DELAY_MS = 1000; // 1 second delay between chunks

/**
 * Sends a single message to Telegram using the Bot API
 */
export async function sendTelegramMessage(
  messageText: string,
  credentials: TelegramCredentials
): Promise<TelegramSendResult> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = credentials;

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${ TELEGRAM_BOT_TOKEN }/sendMessage`;

    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: messageText,
      }),
    });

    const apiResponse = (await response.json().catch(() => null)) as
      | TelegramApiResponse
      | null;

    if (!response.ok || !apiResponse?.ok) {
      const errorMessage = apiResponse?.description
        ? `Telegram API error: ${ apiResponse.description }`
        : `HTTP ${ response.status }: Telegram API request failed`;

      return { success: false, error: errorMessage };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error occurred while sending to Telegram";

    return { success: false, error: errorMessage };
  }
}

/**
 * Splits long messages into chunks and sends them sequentially to Telegram
 * Handles messages longer than Telegram's 4096 character limit
 */
export async function sendLongMessageToTelegram(
  message: string,
  credentials: TelegramCredentials
): Promise<TelegramSendResult> {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return { success: false, error: "Message cannot be empty" };
  }

  // Send directly if message fits within Telegram's limit
  if (trimmedMessage.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
    return sendTelegramMessage(trimmedMessage, credentials);
  }

  // Calculate chunk size accounting for part headers like "Part 1/3:\n\n"
  const chunkSize = TELEGRAM_MESSAGE_MAX_LENGTH - MESSAGE_CHUNK_PADDING;
  const messageChunks: string[] = [];

  // Split message into manageable chunks
  for (let i = 0; i < trimmedMessage.length; i += chunkSize) {
    messageChunks.push(trimmedMessage.slice(i, i + chunkSize));
  }

  // Send each chunk with part numbering
  for (let chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex++) {
    const partNumber = chunkIndex + 1;
    const totalParts = messageChunks.length;
    const chunkWithHeader = `Part ${ partNumber }/${ totalParts }:\n\n${ messageChunks[ chunkIndex ] }`;

    const sendResult = await sendTelegramMessage(chunkWithHeader, credentials);

    if (!sendResult.success) {
      return {
        success: false,
        error: `Failed to send part ${ partNumber }/${ totalParts }: ${ sendResult.error }`,
      };
    }

    // Add delay between chunks to respect Telegram's rate limits
    if (chunkIndex < messageChunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  return {
    success: true,
    sentParts: messageChunks.length
  };
}