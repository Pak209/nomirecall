import { memoryToMarkdown } from '../settingsExport';
import { MemoryItem } from '../../types';

function parseFrontMatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('No YAML front matter found');
  return match[1];
}

describe('memoryToMarkdown', () => {
  it('includes createdAt, updatedAt, project link, and related-memory relationships when present', () => {
    const memory: MemoryItem = {
      id: 'mem-1',
      title: 'Test memory',
      source_type: 'manual_note',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      projectIds: ['project-123'],
      body: 'Some body text',
      ...( { relatedMemoryIds: ['mem-2', 'mem-3'] } as any),
    };

    const markdown = memoryToMarkdown(memory);
    const frontMatter = parseFrontMatter(markdown);

    expect(frontMatter).toContain('createdAt: "2026-01-01T00:00:00.000Z"');
    expect(frontMatter).toContain('updatedAt: "2026-01-02T00:00:00.000Z"');
    expect(frontMatter).toContain('projects: ["project-123"]');
    expect(frontMatter).toContain('relatedMemories: ["mem-2", "mem-3"]');

    // Sanity check the rest of the document still renders as before.
    expect(markdown).toContain('# Test memory');
    expect(markdown).toContain('Some body text');
  });

  it('omits absent fields instead of emitting empty/undefined keys, keeping front matter valid', () => {
    const memory: MemoryItem = {
      id: 'mem-4',
      title: 'Minimal memory',
      source_type: 'manual_note',
      body: 'Minimal body',
    };

    const markdown = memoryToMarkdown(memory);
    const frontMatter = parseFrontMatter(markdown);

    expect(frontMatter).not.toMatch(/undefined/);
    expect(frontMatter).not.toMatch(/:\s*""\s*$/m);
    expect(frontMatter).not.toContain('createdAt');
    expect(frontMatter).not.toContain('updatedAt');
    expect(frontMatter).not.toContain('project');
    expect(frontMatter).not.toContain('relatedMemories');

    // Still valid, parseable front matter with the required baseline keys.
    expect(frontMatter).toContain('title: "Minimal memory"');
    expect(frontMatter).toContain('type: "manual_note"');
    expect(markdown.startsWith('---\n')).toBe(true);
  });
});
