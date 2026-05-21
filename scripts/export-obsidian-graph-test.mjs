#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.resolve(
  process.argv[2] || path.join(repoRoot, "obsidian-graph-test-vault"),
);

const files = new Map([
  [
    "Projects/Nomi.md",
    `---
title: "Nomi"
type: "project"
tags:
  - nomi
  - project
---

# Nomi

Nomi is the memory project that connects captures, sources, and topics into an Obsidian-readable graph.

## Related Topics
- [[AI Agents]]
- [[Personal Knowledge Graph]]
- [[Obsidian]]

## Related Sources
- [[Startup Ideas Pod]]

## Related Captures
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
`,
  ],
  [
    "Topics/AI Agents.md",
    `---
title: "AI Agents"
type: "topic"
tags:
  - ai-agents
  - nomi
---

# AI Agents

AI agents are a core topic for Nomi captures about tools that act, recall, and organize information.

## Related Projects
- [[Nomi]]

## Related Sources
- [[Startup Ideas Pod]]

## Related Captures
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
`,
  ],
  [
    "Topics/Personal Knowledge Graph.md",
    `---
title: "Personal Knowledge Graph"
type: "topic"
tags:
  - knowledge-graph
  - obsidian
  - nomi
---

# Personal Knowledge Graph

A personal knowledge graph connects saved memories through explicit links, backlinks, tags, sources, and projects.

## Related Projects
- [[Nomi]]

## Related Topics
- [[AI Agents]]
- [[Obsidian]]

## Related Captures
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
`,
  ],
  [
    "Topics/Obsidian.md",
    `---
title: "Obsidian"
type: "topic"
tags:
  - obsidian
  - markdown
  - nomi
---

# Obsidian

Obsidian turns Markdown notes with wikilinks into a visible graph of connected ideas.

## Related Projects
- [[Nomi]]

## Related Topics
- [[Personal Knowledge Graph]]
- [[AI Agents]]

## Related Captures
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
`,
  ],
  [
    "Sources/Startup Ideas Pod.md",
    `---
title: "Startup Ideas Pod"
type: "source"
tags:
  - source
  - startups
  - nomi
---

# Startup Ideas Pod

A sample source note for testing how imported posts connect back to sources in Obsidian Graph View.

## Related Projects
- [[Nomi]]

## Related Topics
- [[AI Agents]]
- [[Personal Knowledge Graph]]

## Related Captures
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
`,
  ],
  [
    "Captures/X/Personal AGI is 3-6 months away.md",
    `---
title: "Personal AGI is 3-6 months away"
type: "x-post"
source: "X"
source_url: "https://x.com/startupideaspod/status/2050000000000000001"
author: "@StartupIdeasPod"
created: "2026-05-14T09:00:00Z"
tags:
  - nomi
  - ai-agents
  - personal-agi
projects:
  - Nomi
---

# Personal AGI is 3-6 months away

## Original Post

Personal AGI may arrive sooner than expected when lightweight agents, long-term memory, and local workflows start working together.

## Connections

Projects: [[Nomi]]

Topics: [[AI Agents]] [[Personal Knowledge Graph]] [[Obsidian]]

Source: [[Startup Ideas Pod]]

Related:
- [[Karpathy second brain workflow]]
- [[Nomi Obsidian export test]]
- [[Karpathy second brain workflow|Karpathy workflow follow-up]]

This capture should cluster near [[Nomi]], [[AI Agents]], and [[Personal Knowledge Graph]] in Graph View.
`,
  ],
  [
    "Captures/X/Karpathy second brain workflow.md",
    `---
title: "Karpathy second brain workflow"
type: "x-post"
source: "X"
source_url: "https://x.com/startupideaspod/status/2050000000000000002"
author: "@StartupIdeasPod"
created: "2026-05-14T09:10:00Z"
tags:
  - nomi
  - second-brain
  - obsidian
projects:
  - Nomi
---

# Karpathy second brain workflow

## Original Post

A second brain workflow becomes more useful when captured notes can link to projects, topics, and previous ideas instead of living as isolated bookmarks.

## Connections

Projects: [[Nomi]]

Topics: [[AI Agents]] [[Personal Knowledge Graph]] [[Obsidian]]

Source: [[Startup Ideas Pod]]

Related:
- [[Personal AGI is 3-6 months away]]
- [[Nomi Obsidian export test]]
- [[Personal AGI is 3-6 months away|Personal AGI context]]

This capture should create backlinks into [[Nomi]] and the [[Obsidian]] topic note.
`,
  ],
  [
    "Captures/Notes/Nomi Obsidian export test.md",
    `---
title: "Nomi Obsidian export test"
type: "note"
source: "Nomi"
source_url: ""
author: "Daniel Kimoto"
created: "2026-05-14T09:20:00Z"
tags:
  - nomi
  - obsidian
  - export-test
projects:
  - Nomi
---

# Nomi Obsidian export test

## Original Content

This is a local Nomi note for verifying that exported Markdown creates real Obsidian graph edges with body-level wikilinks.

## Connections

Projects: [[Nomi]]

Topics: [[AI Agents]] [[Personal Knowledge Graph]] [[Obsidian]]

Source: [[Startup Ideas Pod]]

Related:
- [[Personal AGI is 3-6 months away]]
- [[Karpathy second brain workflow]]
- [[Karpathy second brain workflow|Second brain workflow]]

Open the backlinks panel on [[Nomi]] and this note should appear there.
`,
  ],
]);

async function main() {
  for (const [relativePath, markdown] of files) {
    const filePath = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, markdown.trimStart() + "\n", "utf8");
  }

  console.log(`Created ${files.size} Obsidian graph test notes in:`);
  console.log(outputRoot);
  console.log("");
  console.log("Open that folder as an Obsidian vault, then open Graph View and search for Nomi.");
}

main().catch((error) => {
  console.error("Failed to export Obsidian graph test batch:");
  console.error(error);
  process.exitCode = 1;
});
