const DEFAULT_PROCESSING_VERSION = 'v1';
const DEFAULT_SMALL_MODEL = 'gpt-4o-mini';
const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_FREE_DAILY_LIMIT = 10;
const DEFAULT_EARLY_ACCESS_DAILY_LIMIT = 50;
const DEFAULT_ADMIN_DAILY_LIMIT = 150;
// PLACEHOLDER defaults for paid tiers pending product sign-off on final limits.
// Env-overridable via NOMI_AI_DAILY_LIMIT_BRAIN / NOMI_AI_DAILY_LIMIT_PRO.
const DEFAULT_BRAIN_DAILY_LIMIT = 100;
const DEFAULT_PRO_DAILY_LIMIT = 200;

function parseLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function aiConfig() {
  const provider = String(process.env.NOMI_AI_PROVIDER || 'openai').toLowerCase();
  const processingVersion = process.env.NOMI_AI_PROCESSING_VERSION || DEFAULT_PROCESSING_VERSION;
  const model = process.env.NOMI_AI_MODEL_SMALL || DEFAULT_SMALL_MODEL;
  const summaryModel = process.env.NOMI_AI_MODEL_SUMMARY || DEFAULT_SUMMARY_MODEL;
  const embeddingModel = process.env.NOMI_AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const minProcessChars = Number(process.env.NOMI_AI_MIN_PROCESS_CHARS || 40);
  const maxInputChars = Number(process.env.NOMI_AI_MAX_INPUT_CHARS || 6000);
  const defaultBatchLimit = Number(process.env.NOMI_AI_BATCH_LIMIT || 20);
  const dailyLimits = {
    free: parseLimit(process.env.NOMI_AI_DAILY_LIMIT_FREE || process.env.NOMI_AI_FREE_DAILY_LIMIT, DEFAULT_FREE_DAILY_LIMIT),
    early_access: parseLimit(process.env.NOMI_AI_DAILY_LIMIT_EARLY_ACCESS || process.env.NOMI_AI_EARLY_ACCESS_DAILY_LIMIT, DEFAULT_EARLY_ACCESS_DAILY_LIMIT),
    admin: parseLimit(process.env.NOMI_AI_DAILY_LIMIT_ADMIN || process.env.NOMI_AI_ADMIN_DAILY_LIMIT, DEFAULT_ADMIN_DAILY_LIMIT),
    brain: parseLimit(process.env.NOMI_AI_DAILY_LIMIT_BRAIN, DEFAULT_BRAIN_DAILY_LIMIT),
    pro: parseLimit(process.env.NOMI_AI_DAILY_LIMIT_PRO, DEFAULT_PRO_DAILY_LIMIT),
  };
  const disableLimits = String(process.env.NOMI_AI_DISABLE_LIMITS || 'false').toLowerCase() === 'true';
  const dailySyncEnabled = String(process.env.NOMI_DAILY_SYNC_ENABLED || 'false').toLowerCase() === 'true';
  const dailyBriefSchedulerEnabled = String(process.env.NOMI_DAILY_BRIEF_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true';

  return {
    provider,
    processingVersion,
    model,
    summaryModel,
    embeddingModel,
    minProcessChars: Math.max(1, minProcessChars),
    maxInputChars: Math.max(500, maxInputChars),
    defaultBatchLimit: Math.max(1, Math.min(100, defaultBatchLimit)),
    dailyLimits,
    disableLimits,
    dailySyncEnabled,
    dailyBriefSchedulerEnabled,
    openaiApiKey: process.env.OPENAI_API_KEY,
  };
}

module.exports = {
  aiConfig,
};
