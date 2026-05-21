function processMemoryPrompt(input) {
  const source = [
    input.sourceType ? `sourceType: ${input.sourceType}` : null,
    input.sourceUrl ? `sourceUrl: ${input.sourceUrl}` : null,
    input.author?.username ? `authorUsername: @${input.author.username}` : null,
    input.author?.displayName ? `authorDisplayName: ${input.author.displayName}` : null,
    input.capturedAt ? `capturedAt: ${String(input.capturedAt)}` : null,
    input.title ? `title: ${input.title}` : null,
  ].filter(Boolean).join('\n');

  return [
    'You process a user-saved memory for future recall.',
    'Use only the provided content. Do not claim facts are verified.',
    'Return JSON only with concise fields.',
    'Claims are things the source appears to assert, not verified truths.',
    'Category must be one of: AI, Crypto, App Building, Design, Marketing, Business, Research, Productivity, Personal, Other.',
    'Tags are short. Concepts are higher-level ideas. Entities are people, products, companies, protocols, frameworks, apps, tools, or projects.',
    'ImportanceScore is likely future recall usefulness from 0 to 1, not truthfulness.',
    '',
    'Source metadata:',
    source || 'none',
    '',
    'Content:',
    input.cleanText || input.rawText || '',
    '',
    'JSON shape:',
    '{"summary":"1-3 sentence summary","category":"string","tags":["string"],"concepts":["string"],"entities":["string"],"claims":["string"],"actionItems":["string"],"keyTakeaways":["string"],"suggestedProjects":["string"],"importanceScore":0.0}',
  ].join('\n');
}

function dailyBriefPrompt(input) {
  const memories = input.memories.map((memory, index) => [
    `#${index + 1} id=${memory.id}`,
    `title: ${memory.title || 'Untitled memory'}`,
    `sourceType: ${memory.sourceType || 'unknown'}`,
    memory.author ? `author: ${memory.author}` : null,
    memory.sourceUrl ? `sourceUrl: ${memory.sourceUrl}` : null,
    `summary: ${memory.summary || memory.text || ''}`,
    memory.tags?.length ? `tags: ${memory.tags.join(', ')}` : null,
    memory.concepts?.length ? `concepts: ${memory.concepts.join(', ')}` : null,
    memory.entities?.length ? `entities: ${memory.entities.join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const older = input.connectedOlderMemories.map((memory) => [
    `id=${memory.id}`,
    `title: ${memory.title || 'Untitled memory'}`,
    `reason: ${memory.reason}`,
    `summary: ${memory.summary || ''}`,
  ].join('\n')).join('\n\n');

  const projects = input.projects.map((project) => [
    `id=${project.id}`,
    `name: ${project.name}`,
    project.description ? `description: ${project.description}` : null,
    project.tags?.length ? `tags: ${project.tags.join(', ')}` : null,
    project.concepts?.length ? `concepts: ${project.concepts.join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    'Create a private Daily Nomi Brief grounded only in the user saved memories below.',
    'Label insights as based on saved memories. Do not claim external fact-checking.',
    'Prefer concise source-backed references using memoryIds.',
    'Return compact JSON only.',
    '',
    `dateKey: ${input.dateKey}`,
    `timezone: ${input.timezone || 'unknown'}`,
    '',
    'Today memories:',
    memories || 'none',
    '',
    'Potential connected older memories:',
    older || 'none',
    '',
    'Existing projects:',
    projects || 'none',
    '',
    'JSON shape:',
    '{"title":"string","overview":"string","mainThemes":[{"name":"string","summary":"string","memoryIds":["id"]}],"bestSaves":[{"memoryId":"id","title":"string","reason":"string"}],"actionableIdeas":[{"text":"string","memoryIds":["id"],"priority":"low|medium|high"}],"connectedOlderMemories":[{"memoryId":"id","title":"string","reason":"string"}],"suggestedFollowUps":["string"],"suggestedProjectLinks":[{"projectId":"id","projectName":"string","reason":"string","memoryIds":["id"]}]}',
  ].join('\n');
}

function projectSummaryPrompt(input) {
  const memories = input.memories.map((memory, index) => [
    `#${index + 1} id=${memory.id}`,
    `title: ${memory.title || 'Untitled memory'}`,
    `summary: ${memory.summary || memory.text || ''}`,
    memory.tags?.length ? `tags: ${memory.tags.join(', ')}` : null,
    memory.concepts?.length ? `concepts: ${memory.concepts.join(', ')}` : null,
    memory.entities?.length ? `entities: ${memory.entities.join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    'Create a project intelligence summary grounded only in linked saved memories.',
    'Do not claim external fact-checking. Return compact JSON only.',
    '',
    `projectName: ${input.project.name}`,
    input.project.description ? `projectDescription: ${input.project.description}` : '',
    '',
    'Linked memories:',
    memories || 'none',
    '',
    'JSON shape:',
    '{"summary":"string","mainThemes":["string"],"openQuestions":["string"],"nextActions":["string"],"relatedMemoryIds":["id"],"suggestedMemoryIds":["id"]}',
  ].join('\n');
}

function answerMemoryQuestionPrompt(input) {
  const memories = input.memories.map((memory) => [
    `${memory.citation} memoryId=${memory.memoryId}`,
    `title: ${memory.title || 'Untitled memory'}`,
    memory.sourceType ? `sourceType: ${memory.sourceType}` : null,
    memory.sourceUrl ? `sourceUrl: ${memory.sourceUrl}` : null,
    memory.category ? `category: ${memory.category}` : null,
    memory.tags?.length ? `tags: ${memory.tags.join(', ')}` : null,
    memory.concepts?.length ? `concepts: ${memory.concepts.join(', ')}` : null,
    memory.entities?.length ? `entities: ${memory.entities.join(', ')}` : null,
    memory.capturedAt ? `capturedAt: ${memory.capturedAt}` : null,
    `snippet: ${memory.snippet || ''}`,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    'Answer the user question using only the saved memory snippets below.',
    'If the snippets do not contain enough information, say that Nomi does not have enough saved context yet.',
    'Do not use outside knowledge. Do not invent details. Keep the answer concise and useful.',
    'Cite supporting memories inline using their citation labels like [1] or [2].',
    'Return compact JSON only.',
    '',
    `Question: ${input.question}`,
    '',
    'Retrieved memories:',
    memories || 'none',
    '',
    'JSON shape:',
    '{"answer":"string with inline citations","confidence":"low|medium|high","relatedMemoryIds":["memoryId"]}',
  ].join('\n');
}

function topicPagePrompt(input) {
  const memories = input.memories.map((memory, index) => [
    `#${index + 1} id=${memory.id}`,
    `title: ${memory.title || 'Untitled memory'}`,
    memory.summary ? `summary: ${memory.summary}` : null,
    memory.rawText ? `snippet: ${String(memory.rawText).replace(/\s+/g, ' ').trim().slice(0, 420)}` : null,
    memory.tags?.length ? `tags: ${memory.tags.join(', ')}` : null,
    memory.concepts?.length ? `concepts: ${memory.concepts.join(', ')}` : null,
    memory.entities?.length ? `entities: ${memory.entities.join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    'Create a private wiki topic page grounded only in the saved memories below.',
    'Do not use outside facts. Do not explain what a product/person/topic is unless a saved memory says it.',
    'Every key idea must include supportingMemoryIds from the saved memory ids below.',
    'Only include a key idea when at least one cited memory directly supports it.',
    'Keep the summary compact and based only on the cited key ideas.',
    'Return compact JSON only.',
    '',
    `Topic candidate: ${input.title}`,
    '',
    'Saved memories:',
    memories || 'none',
    '',
    'JSON shape:',
    '{"title":"string","summary":"string","keyIdeas":[{"idea":"string","supportingMemoryIds":["memoryId"]}],"openQuestions":["string"],"possibleRelatedTopics":["string"]}',
  ].join('\n');
}

function translateMemoryTextPrompt(input) {
  return [
    'Translate this user-saved post into natural English if it is not already English.',
    'If it is already English, return the original text unchanged.',
    'Preserve names, product names, URLs, handles, hashtags, and line breaks as much as practical.',
    'Do not add commentary or explanations. Return compact JSON only.',
    '',
    'Text:',
    input.text || '',
    '',
    'JSON shape:',
    '{"translatedText":"string","sourceLanguage":"language name or unknown","wasTranslated":true}',
  ].join('\n');
}

module.exports = {
  answerMemoryQuestionPrompt,
  processMemoryPrompt,
  dailyBriefPrompt,
  projectSummaryPrompt,
  topicPagePrompt,
  translateMemoryTextPrompt,
};
