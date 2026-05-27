#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEW_DEMO_EXPORTED_AT,
  REVIEW_DEMO_MEMORIES,
  REVIEW_DEMO_PROJECTS,
  REVIEW_DEMO_SOURCES,
  REVIEW_DEMO_TOPICS,
  demoMemoryById,
} from "./lib/reviewDemoData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.resolve(
  process.argv[2] || path.join(repoRoot, "obsidian-graph-test-vault"),
);

function yamlList(items) {
  return items.map((item) => `  - "${escapeYaml(item)}"`).join("\n");
}

function escapeYaml(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slugFilename(title) {
  return `${String(title)
    .replace(/[/:\"?#%&{}<>*$!'@+`|=\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)}.md`;
}

function wikiLink(title) {
  return `[[${title}]]`;
}

function captureFolder(memory) {
  if (memory.type === "tweet") return "Captures/X";
  if (memory.type === "url") return "Captures/Links";
  if (memory.type === "image") return "Captures/Images";
  if (memory.type === "voice") return "Captures/Voice";
  return "Captures/Notes";
}

function captureType(memory) {
  if (memory.type === "tweet") return "x-post";
  if (memory.type === "url") return "link";
  return memory.type || "note";
}

function sourceTitle(memory) {
  return memory.sourceName || memory.sourceUsername || "Nomi";
}

function relatedLinks(memory) {
  const links = memory.relatedIds
    .map(demoMemoryById)
    .filter(Boolean)
    .map((related) => wikiLink(related.title));
  return links.length ? links.join(" ") : "None";
}

function captureMarkdown(memory) {
  const topics = memory.topics.map(wikiLink).join(" ");
  const projects = memory.projects.map(wikiLink).join(" ");
  const source = wikiLink(sourceTitle(memory));
  const related = relatedLinks(memory);
  const sourceLines = [
    "- Saved from: Nomi",
    `- Source note: ${source}`,
    memory.sourceUsername ? `- Author: ${memory.sourceUsername.startsWith("@") ? memory.sourceUsername : `@${memory.sourceUsername}`}` : "",
    memory.sourceUrl ? `- Original URL: ${memory.sourceUrl}` : "",
    memory.postDate ? `- Source Date: ${memory.postDate.slice(0, 10)}` : "",
    ...(memory.links || []).map((link) => `- Link: ${link.url}`),
    ...(memory.media || []).map((media) => `- ${media.type}: ${media.url || media.previewImageUrl}`),
  ].filter(Boolean);

  const optionalLinks = memory.links?.length
    ? `\n## Links\n\n${memory.links.map((link) => `- [${link.title || link.displayUrl || link.url}](${link.url})`).join("\n")}\n`
    : "";
  const optionalMedia = memory.media?.length
    ? `\n## Media\n\n${memory.media.map((media) => `- ${media.altText || media.type}: ${media.url || media.previewImageUrl}`).join("\n")}\n`
    : "";

  return `---
title: "${escapeYaml(memory.title)}"
type: "${captureType(memory)}"
source: "${escapeYaml(sourceTitle(memory))}"
source_url: "${escapeYaml(memory.sourceUrl || "")}"
author: "${escapeYaml(memory.sourceUsername || sourceTitle(memory))}"
created: "${memory.createdAt}"
tags:
${yamlList(memory.tags)}
projects:
${yamlList(memory.projects)}
topics:
${yamlList(memory.topics)}
exported_at: "${REVIEW_DEMO_EXPORTED_AT}"
---

# ${memory.title}

## Summary

${memory.summary}

## Connections

- Topics: ${topics}
- Projects: ${projects}
- Source: ${source}
- Related: ${related}

## ${memory.type === "tweet" ? "Original Post" : "Original Content"}

${memory.body}

## My Tags

${memory.tags.map((tag) => `#${tag}`).join(" ")}

## Source

${sourceLines.join("\n")}
${optionalLinks}${optionalMedia}`;
}

function hubMarkdown({ title, tags, summary }, kind, memories) {
  const related = memories
    .filter((memory) => {
      if (kind === "project") return memory.projects.includes(title);
      if (kind === "topic") return memory.topics.includes(title);
      return sourceTitle(memory) === title;
    })
    .map((memory) => `- ${wikiLink(memory.title)}`)
    .join("\n");

  return `---
title: "${escapeYaml(title)}"
type: "${kind}"
source: "Nomi"
source_url: ""
author: "Nomi"
created: "${REVIEW_DEMO_EXPORTED_AT}"
tags:
${yamlList(tags)}
projects:
  - "Nomi Review Demo"
---

# ${title}

${summary}

## Related Captures

${related}
`;
}

async function writeVaultFile(relativePath, markdown) {
  const filePath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown.trimStart() + "\n", "utf8");
}

async function main() {
  const shouldClean = !process.argv.includes("--no-clean");
  if (shouldClean) await rm(outputRoot, { recursive: true, force: true });

  for (const project of REVIEW_DEMO_PROJECTS) {
    await writeVaultFile(`Projects/${slugFilename(project.title)}`, hubMarkdown(project, "project", REVIEW_DEMO_MEMORIES));
  }
  for (const topic of REVIEW_DEMO_TOPICS) {
    await writeVaultFile(`Topics/${slugFilename(topic.title)}`, hubMarkdown(topic, "topic", REVIEW_DEMO_MEMORIES));
  }
  for (const source of REVIEW_DEMO_SOURCES) {
    await writeVaultFile(`Sources/${slugFilename(source.title)}`, hubMarkdown(source, "source", REVIEW_DEMO_MEMORIES));
  }
  for (const memory of REVIEW_DEMO_MEMORIES) {
    await writeVaultFile(`${captureFolder(memory)}/${slugFilename(memory.title)}`, captureMarkdown(memory));
  }

  const fileCount = REVIEW_DEMO_PROJECTS.length + REVIEW_DEMO_TOPICS.length + REVIEW_DEMO_SOURCES.length + REVIEW_DEMO_MEMORIES.length;
  console.log(`Created ${fileCount} review-safe Obsidian demo notes in:`);
  console.log(outputRoot);
  console.log("");
  console.log("Open that folder as an Obsidian vault, then open Graph View and search for Nomi Review Demo.");
}

main().catch((error) => {
  console.error("Failed to export review-safe Obsidian demo vault:");
  console.error(error);
  process.exitCode = 1;
});
