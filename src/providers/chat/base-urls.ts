// The only destinations a chat SDK client may be given (003 research R2, R10). The privacy guard fails on any other
// `baseURL` in src, so every chat request's host stays visible in one place; the manifest's host permissions match.
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
