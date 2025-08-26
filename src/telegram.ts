// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

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

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const MESSAGE_SAFETY_BUFFER = 200; // Safety buffer for headers, Markdown, etc.
const RATE_LIMIT_DELAY_MS = 1000; // 1 second delay between chunks

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

/**
 * Sends a single message to Telegram using the Bot API
 */
export async function sendTelegramMessage(
  messageText: string,
  credentials: TelegramCredentials,
): Promise<TelegramSendResult> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = credentials;

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${ TELEGRAM_BOT_TOKEN }/sendMessage`;

    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `\`\`\`\n${ messageText }\n\`\`\``,
        parse_mode: "MarkdownV2",
      }),
    });

    const apiResponse = (await response.json().catch(() => null)) as TelegramApiResponse | null;

    if (!response.ok || !apiResponse?.ok) {
      const errorMessage = apiResponse?.description
        ? `Telegram API error: ${ apiResponse.description }`
        : `HTTP ${ response.status }: Telegram API request failed`;

      return { success: false, error: errorMessage };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred while sending to Telegram";

    return { success: false, error: errorMessage };
  }
}

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->

/**
 * Splits a message into chunks at word boundaries when possible
 * Falls back to character splitting if individual words exceed chunk size
 */
function splitMessageIntoChunks(message: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  // Split by words (spaces and newlines)
  const words = message.split(/(\s+)/);

  for (const word of words) {
    // If adding this word would exceed the limit
    if (currentChunk.length + word.length > maxChunkSize) {
      // If we have content in current chunk, save it
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // If the word itself is longer than max chunk size, split it by characters
      if (word.length > maxChunkSize) {
        for (let i = 0; i < word.length; i += maxChunkSize) {
          chunks.push(word.slice(i, i + maxChunkSize));
        }
      } else {
        currentChunk = word;
      }
    } else {
      currentChunk += word;
    }
  }

  // Add any remaining content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->
/**
 * Splits long messages into chunks and sends them sequentially to Telegram
 * Handles messages longer than Telegram's 4096 character limit
 * Enhanced to split on word boundaries when possible
 */
export async function sendLongMessageToTelegram(
  message: string,
  credentials: TelegramCredentials,
): Promise<TelegramSendResult> {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return { success: false, error: "Message cannot be empty" };
  }

  // Send directly if message fits within safe limit
  if (trimmedMessage.length <= TELEGRAM_MESSAGE_MAX_LENGTH - MESSAGE_SAFETY_BUFFER) {
    return sendTelegramMessage(trimmedMessage, credentials);
  }

  const chunkSize = TELEGRAM_MESSAGE_MAX_LENGTH - MESSAGE_SAFETY_BUFFER;
  const messageChunks = splitMessageIntoChunks(trimmedMessage, chunkSize);

  // Send each chunk sequentially
  for (let chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex++) {
    const partNumber = chunkIndex + 1;
    const totalParts = messageChunks.length;
    const header = `Part ${ partNumber }/${ totalParts }:`;
    const chunkWithHeader = `${ header }\n\n${ messageChunks[ chunkIndex ] }`;

    // Ensure chunk with header is within Telegram's limit
    if (chunkWithHeader.length > TELEGRAM_MESSAGE_MAX_LENGTH) {
      return {
        success: false,
        error: `Chunk ${ partNumber } exceeds Telegram's message length limit`,
      };
    }

    const sendResult = await sendTelegramMessage(chunkWithHeader, credentials);

    if (!sendResult.success) {
      return {
        success: false,
        error: `Failed to send part ${ partNumber }/${ totalParts }: ${ sendResult.error }`,
      };
    }

    // Delay to respect Telegram's rate limit
    if (chunkIndex < messageChunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  return {
    success: true,
    sentParts: messageChunks.length,
  };
}

// ------------------------------------------------------------>
// -------------------------------------------------------------->
// ---------------------------------------------------------------->