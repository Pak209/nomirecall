const { aiConfig } = require('./aiConfig');
const {
  normalizeDailyBriefOutput,
  normalizeProcessedMemoryAI,
  normalizeProjectSummaryOutput,
} = require('./aiSchemas');
const {
  answerMemoryQuestionPrompt,
  dailyBriefPrompt,
  processMemoryPrompt,
  projectSummaryPrompt,
  topicPagePrompt,
  translateMemoryTextPrompt,
} = require('./prompts');

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

  async answerMemoryQuestion(input) {
    const parsed = await this.jsonCompletion({
      prompt: answerMemoryQuestionPrompt(input),
      model: this.config.summaryModel,
      system: 'You are Nomi memory question answering. Use only supplied saved memories. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty memory answer.',
      invalidMessage: 'OpenAI returned invalid JSON for memory question answering.',
    });

    const confidence = ['low', 'medium', 'high'].includes(parsed?.confidence)
      ? parsed.confidence
      : 'low';

    return {
      answer: typeof parsed?.answer === 'string' ? parsed.answer.trim().slice(0, 2400) : '',
      confidence,
      relatedMemoryIds: Array.isArray(parsed?.relatedMemoryIds)
        ? parsed.relatedMemoryIds.map(String).filter(Boolean).slice(0, 8)
        : [],
    };
  }

  async synthesizeTopicPage(input) {
    const parsed = await this.jsonCompletion({
      prompt: topicPagePrompt(input),
      model: this.config.summaryModel,
      system: 'You are Nomi private wiki synthesis. Use only saved memories. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty topic page.',
      invalidMessage: 'OpenAI returned invalid JSON for topic page synthesis.',
    });

    return {
      title: typeof parsed?.title === 'string' ? parsed.title.trim().slice(0, 120) : String(input.title || 'Topic').slice(0, 120),
      summary: typeof parsed?.summary === 'string' ? parsed.summary.trim().slice(0, 1600) : '',
      keyIdeas: Array.isArray(parsed?.keyIdeas) ? parsed.keyIdeas.slice(0, 10) : [],
      openQuestions: Array.isArray(parsed?.openQuestions) ? parsed.openQuestions.map(String).filter(Boolean).slice(0, 8) : [],
      possibleRelatedTopics: Array.isArray(parsed?.possibleRelatedTopics) ? parsed.possibleRelatedTopics.map(String).filter(Boolean).slice(0, 8) : [],
    };
  }

  async translateMemoryText(input) {
    const parsed = await this.jsonCompletion({
      prompt: translateMemoryTextPrompt(input),
      model: this.config.summaryModel,
      system: 'You translate user-saved memory text into English. Return compact valid JSON only.',
      emptyMessage: 'OpenAI returned an empty translation result.',
      invalidMessage: 'OpenAI returned invalid JSON for memory translation.',
    });

    const translatedText = typeof parsed?.translatedText === 'string'
      ? parsed.translatedText.trim().slice(0, 12000)
      : '';

    return {
      translatedText,
      sourceLanguage: typeof parsed?.sourceLanguage === 'string' ? parsed.sourceLanguage.trim().slice(0, 80) : 'unknown',
      wasTranslated: parsed?.wasTranslated === true && translatedText.length > 0,
    };
  }

  async embedText(input) {
    if (!this.config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: String(input || '').slice(0, 8000),
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || `OpenAI embedding request failed with ${response.status}.`;
      throw new Error(message);
    }

    const embedding = payload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || !embedding.length) {
      throw new Error('OpenAI returned an empty embedding.');
    }
    return embedding.map(Number);
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
