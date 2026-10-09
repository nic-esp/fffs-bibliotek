export const DEFAULT_DATA_BASE_URL: string;
export function normalizeRequest(request: Request, endpoint: '/mcp' | '/health'): Request | null;
export function runtimeEnv(env?: Record<string, string | undefined>): { DATA_BASE_URL: string; ALLOWED_ORIGINS: string };
export function createFetchHandler(endpoint: '/mcp' | '/health'): (request: Request) => Promise<Response>;
