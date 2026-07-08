import { MemoryItem } from '../types';

function markdownValue(value?: string) {
  return String(value || '').replace(/"/g, '\\"');
}

function yamlStringList(values: string[]) {
  return `[${values.map((value) => `"${markdownValue(value)}"`).join(', ')}]`;
}

export function memoryToMarkdown(memory: MemoryItem) {
  const body = memory.body || '';
  const tags = memory.tags?.length ? memory.tags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ') : '';
  // Some fields (e.g. related-memory relationships) aren't yet part of the
  // typed MemoryItem shape but may be present on the runtime object once the
  // backend starts sending them — read defensively so export front matter
  // stays forward-compatible without inventing new required fields.
  const dynamicMemory = memory as MemoryItem & { relatedMemoryIds?: string[]; projectName?: string };
  const relatedMemoryIds = dynamicMemory.relatedMemoryIds;

  return [
    '---',
    `title: "${markdownValue(memory.title)}"`,
    `type: "${markdownValue(memory.source_type)}"`,
    `category: "${markdownValue(memory.category || 'General')}"`,
    memory.source_url ? `source: "${markdownValue(memory.source_url)}"` : '',
    memory.authorUsername ? `author: "@${markdownValue(memory.authorUsername)}"` : '',
    memory.postDate ? `postDate: "${markdownValue(memory.postDate)}"` : '',
    memory.createdAt ? `createdAt: "${markdownValue(memory.createdAt)}"` : '',
    memory.updatedAt ? `updatedAt: "${markdownValue(memory.updatedAt)}"` : '',
    dynamicMemory.projectName ? `project: "${markdownValue(dynamicMemory.projectName)}"` : '',
    memory.projectIds?.length ? `projects: ${yamlStringList(memory.projectIds)}` : '',
    relatedMemoryIds?.length ? `relatedMemories: ${yamlStringList(relatedMemoryIds)}` : '',
    '---',
    '',
    `# ${memory.title || 'Untitled memory'}`,
    '',
    body || '_No body saved._',
    '',
    tags,
  ].filter(Boolean).join('\n');
}

export function exportMarkdown(memories: MemoryItem[]) {
  const exportedAt = new Date().toISOString();
  return [
    '# Nomi Obsidian Export',
    '',
    `Exported: ${exportedAt}`,
    `Memories: ${memories.length}`,
    '',
    memories.map(memoryToMarkdown).join('\n\n---\n\n'),
  ].join('\n');
}
