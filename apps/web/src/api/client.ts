const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: unknown = null;
  let parseError: string | null = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      parseError = text.slice(0, 120);
    }
  }

  if (!response.ok) {
    const hasStructuredError =
      payload !== null &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string";

    let message = hasStructuredError
      ? (payload as { error: string }).error
      : `Request failed with status ${response.status}`;

    // Vite proxy returns 500 with an empty body when the gateway on :3001 is not running.
    if (!hasStructuredError && response.status === 500 && (text.length === 0 || parseError !== null)) {
      message =
        "API gateway unavailable (localhost:3001). Start the backend: bun run db:up && bun run dev:stack";
    }

    throw new ApiError(message, response.status);
  }

  return payload as T;
}
