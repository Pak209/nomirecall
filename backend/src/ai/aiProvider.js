const { aiConfig } = require('./aiConfig');
const {
  normalizeDailyBriefOutput,
  normalizeProcessedMemoryAI,
  normalizeProjectSummaryOutput,
} = require('./aiSchemas');
const { dailyBriefPrompt, processMemoryPrompt, projectSummaryPrompt } = require('./prompts');

class OpenAIProvider {
  constructor(config = aiConfig()) {
    this.config = config;
  }

  async processMemory(input) {
    const parsed = await this.jsonCompletion({
      prompt: processMemoryPrompt(input),
      model: this.config.model,
      system: 'You are Nomi memory processing. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty memory processing result.',
      invalidMessage: 'OpenAI returned invalid JSON for memory processing.',
    });

    return normalizeProcessedMemoryAI(parsed, {
      modelUsed: this.config.model,
      processingVersion: this.config.processingVersion,
    });
  }

  async generateDailyBrief(input) {
    const parsed = await this.jsonCompletion({
      prompt: dailyBriefPrompt(input),
      model: this.config.summaryModel,
      system: 'You are Nomi daily brief generation. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty daily brief result.',
      invalidMessage: 'OpenAI returned invalid JSON for daily brief generation.',
    });

    return normalizeDailyBriefOutput(parsed, {
      modelUsed: this.config.summaryModel,
      processingVersion: this.config.processingVersion,
    });
  }

  async generateProjectSummary(input) {
    const parsed = await this.jsonCompletion({
      prompt: projectSummaryPrompt(input),
      model: this.config.summaryModel,
      system: 'You are Nomi project intelligence. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty project summary result.',
      invalidMessage: 'OpenAI returned invalid JSON for project summary generation.',
    });

    return normalizeProjectSummaryOutput(parsed, {
      modelUsed: this.config.summaryModel,
      processingVersion: this.config.processingVersion,
    });
  }

  async jsonCompletion({ prompt, model, system, emptyMessage, invalidMessage }) {
    if (!this.config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: system,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || `OpenAI request failed with ${response.status}.`;
      throw new Error(message);
    }

    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw) throw new Error(emptyMessage);

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(invalidMessage);
    }
  }
}

function createAIProvider(config = aiConfig()) {
  if (config.provider !== 'openai') {
    throw new Error(`Unsupported NOMI_AI_PROVIDER "${config.provider}".`);
  }
  return new OpenAIProvider(config);
}

module.exports = {
  OpenAIProvider,
  createAIProvider,
};
