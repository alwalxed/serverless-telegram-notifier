import type { Context } from "hono";

// API response structure for consistent JSON responses
type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};

/**
 * Creates a standardized API response object
 */
export function createApiResponse<T>(
  success: boolean,
  message?: string,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    ...(message && { message }),
    ...(data && { data }),
    ...(error && { error }),
  };
}

// Request information structure
type RequestInfo = {
  timestamp: string;
  method: string;
  url: string;
  path: string;
  ipAddress: string;
  headers: Record<string, string>;
};

/**
 * Extracts comprehensive request information from Hono context
 * Returns formatted string with request details for logging/monitoring
 */
export function extractRequestInfo(context: Context): string {
  const request = context.req;

  // Extract relevant headers for monitoring
  const headers: Record<string, string> = {
    "user-agent": request.header("user-agent") || "unknown",
    "accept-language": request.header("accept-language") || "unknown",
    "host": request.header("host") || "unknown",
    "x-forwarded-for": request.header("x-forwarded-for") || "unknown",
    "cf-connecting-ip": request.header("cf-connecting-ip") || "unknown",
    "cf-ray": request.header("cf-ray") || "unknown",
  };

  // Determine client IP address from various possible headers
  const ipAddress =
    request.header("cf-connecting-ip") ||  // Cloudflare's real IP
    request.header("x-forwarded-for") ||   // Standard proxy header
    request.header("x-real-ip") ||         // Alternative real IP header
    "unknown";

  const requestInfo: RequestInfo = {
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    path: request.path,
    ipAddress,
    headers,
  };

  // Format as readable string for Telegram messages
  return `Request received at ${ requestInfo.timestamp }

Request Details:
- Method: ${ requestInfo.method }
- URL: ${ requestInfo.url }
- Path: ${ requestInfo.path }
- IP Address: ${ requestInfo.ipAddress }
- Headers: ${ JSON.stringify(requestInfo.headers, null, 2) }`;
}