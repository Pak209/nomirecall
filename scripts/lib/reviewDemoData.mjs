export const REVIEW_DEMO_EXPORTED_AT = "2026-05-14T12:05:00Z";

export const REVIEW_DEMO_PROJECTS = [
  {
    title: "Nomi Review Demo",
    tags: ["nomi", "review-demo", "project"],
    summary:
      "A screenshot-safe sample project that shows how Nomi connects notes, links, posts, image notes, and voice thoughts into a reusable memory graph.",
  },
];

export const REVIEW_DEMO_TOPICS = [
  {
    title: "Review Safe Capture",
    tags: ["review-demo", "capture"],
    summary:
      "A topic for private, fictional captures that avoid personal data, credentials, medical advice, financial advice, and real private links.",
  },
  {
    title: "Obsidian Export",
    tags: ["obsidian", "markdown", "export"],
    summary:
      "A topic for Markdown notes, wikilinks, backlinks, source notes, and project hubs that can be opened as an Obsidian vault.",
  },
  {
    title: "Product Research",
    tags: ["product", "research"],
    summary:
      "A topic for lightweight product thinking grounded in saved notes, links, and meeting follow-ups.",
  },
  {
    title: "Daily Recall",
    tags: ["daily-recall", "workflow"],
    summary:
      "A topic for small daily habits that make captured memories easier to revisit later.",
  },
];

export const REVIEW_DEMO_SOURCES = [
  {
    title: "Nomi",
    tags: ["source", "nomi"],
    summary: "Local manual captures created inside Nomi.",
  },
  {
    title: "Nomi Demo Lab",
    tags: ["source", "review-demo"],
    summary: "A fictional public source used only for App Store review screenshots and local demos.",
  },
  {
    title: "Example Research Digest",
    tags: ["source", "research"],
    summary: "A fictional link source that uses reserved example.com URLs.",
  },
  {
    title: "Nomi Voice Note",
    tags: ["source", "voice"],
    summary: "A local voice-note source for transcript export testing.",
  },
];

export const REVIEW_DEMO_MEMORIES = [
  {
    id: "review-demo-capture-rhythm",
    title: "Capture rhythm for launch week",
    type: "note",
    sourceType: "manual_note",
    sourceName: "Nomi",
    sourceUrl: "",
    createdAt: "2026-05-14T09:00:00Z",
    category: "Product",
    tags: ["review-demo", "launch", "capture", "daily-recall"],
    concepts: ["Daily Recall", "Review Safe Capture", "Product Research"],
    entities: ["Nomi Review Demo"],
    intent: "build_later",
    projects: ["Nomi Review Demo"],
    topics: ["Daily Recall", "Review Safe Capture", "Product Research"],
    relatedIds: ["review-demo-research-link", "review-demo-voice-retro", "review-demo-x-post"],
    summary:
      "Launch-week captures should stay short, specific, and easy to revisit from Recall or an Obsidian export.",
    body:
      "For launch week, keep each memory to one clear idea: what happened, why it matters, and the next tiny action. Use tags like review-demo, launch, and daily-recall so Nomi can group related screenshots without exposing real notes.",
  },
  {
    id: "review-demo-research-link",
    title: "Example digest on calmer capture tools",
    type: "url",
    sourceType: "link",
    sourceName: "Example Research Digest",
    sourceUrl: "https://example.com/nomi/research/calm-capture-tools",
    createdAt: "2026-05-14T09:12:00Z",
    category: "Research",
    tags: ["review-demo", "research", "obsidian", "capture"],
    concepts: ["Obsidian Export", "Product Research", "Review Safe Capture"],
    entities: ["Example Research Digest", "Nomi Review Demo"],
    intent: "research",
    projects: ["Nomi Review Demo"],
    topics: ["Obsidian Export", "Product Research", "Review Safe Capture"],
    links: [
      {
        url: "https://example.com/nomi/research/calm-capture-tools",
        displayUrl: "example.com/nomi/research/calm-capture-tools",
        title: "Calmer capture tools",
      },
    ],
    relatedIds: ["review-demo-capture-rhythm", "review-demo-export-checklist", "review-demo-image-note"],
    summary:
      "A reserved-domain link memory for testing source URLs, backlinks, and research tags without sending reviewers to private pages.",
    body:
      "The digest argues that capture tools feel better when the first save is lightweight and the organization can happen later. Save the link, add two tags, and let export-ready Markdown create the structure after the thought is captured.",
  },
  {
    id: "review-demo-x-post",
    title: "Nomi Demo Lab on X",
    type: "tweet",
    sourceType: "x_bookmark",
    sourceName: "Nomi Demo Lab",
    sourceUsername: "nomi_demo_lab",
    sourceUrl: "https://x.com/nomi_demo_lab/status/2060000000000000001",
    createdAt: "2026-05-14T09:24:00Z",
    postDate: "2026-05-14T09:20:00Z",
    category: "Product",
    tags: ["review-demo", "xpost", "product", "daily-recall"],
    concepts: ["Daily Recall", "Product Research"],
    entities: ["Nomi Demo Lab", "Nomi Review Demo"],
    intent: "idea",
    projects: ["Nomi Review Demo"],
    topics: ["Daily Recall", "Product Research"],
    relatedIds: ["review-demo-capture-rhythm", "review-demo-voice-retro"],
    summary:
      "A fictional public-post memory for demonstrating X import fields without using real third-party content.",
    body:
      "A good recall app should make yesterday's useful idea feel one tap away today: save the post, preserve the source, and connect it back to the project that needs it.",
  },
  {
    id: "review-demo-image-note",
    title: "Whiteboard photo: export flow",
    type: "image",
    sourceType: "image",
    sourceName: "Nomi",
    sourceUrl: "",
    createdAt: "2026-05-14T09:36:00Z",
    category: "Design",
    tags: ["review-demo", "image", "obsidian", "export"],
    concepts: ["Obsidian Export", "Review Safe Capture"],
    entities: ["Nomi Review Demo"],
    intent: "build_later",
    projects: ["Nomi Review Demo"],
    topics: ["Obsidian Export", "Review Safe Capture"],
    media: [
      {
        type: "photo",
        url: "https://example.com/nomi/assets/review-demo-whiteboard.png",
        previewImageUrl: "https://example.com/nomi/assets/review-demo-whiteboard-preview.png",
        altText: "Fictional whiteboard sketch of notes flowing into an Obsidian vault.",
        width: 1200,
        height: 800,
      },
    ],
    relatedIds: ["review-demo-research-link", "review-demo-export-checklist"],
    summary:
      "An image memory with safe placeholder media URLs for detail screens and Markdown media sections.",
    body:
      "Whiteboard sketch: Capture inbox on the left, reviewed memories in the middle, and Obsidian folders on the right. Keep the screenshot focused on flow and labels, not private customer data.",
  },
  {
    id: "review-demo-voice-retro",
    title: "Voice note: Friday demo retro",
    type: "voice",
    sourceType: "voice",
    sourceName: "Nomi Voice Note",
    sourceUrl: "",
    createdAt: "2026-05-14T09:48:00Z",
    category: "Reflection",
    tags: ["review-demo", "voice", "reflection", "daily-recall"],
    concepts: ["Daily Recall", "Review Safe Capture"],
    entities: ["Nomi Review Demo"],
    intent: "personal",
    projects: ["Nomi Review Demo"],
    topics: ["Daily Recall", "Review Safe Capture"],
    relatedIds: ["review-demo-x-post", "review-demo-capture-rhythm"],
    summary:
      "A friendly transcript-style voice memory that shows recall without containing sensitive personal details.",
    body:
      "Voice transcript: The demo felt clearest when I opened Recall first, searched for launch, and then previewed the Markdown export. Next pass: keep the example vault small enough that every backlink is easy to inspect.",
  },
  {
    id: "review-demo-export-checklist",
    title: "Obsidian export screenshot checklist",
    type: "note",
    sourceType: "manual_note",
    sourceName: "Nomi",
    sourceUrl: "",
    createdAt: "2026-05-14T10:00:00Z",
    category: "QA",
    tags: ["review-demo", "qa", "obsidian", "export"],
    concepts: ["Obsidian Export", "Review Safe Capture"],
    entities: ["Nomi Review Demo", "Obsidian"],
    intent: "build_later",
    projects: ["Nomi Review Demo"],
    topics: ["Obsidian Export", "Review Safe Capture"],
    relatedIds: ["review-demo-image-note", "review-demo-research-link"],
    summary:
      "A QA memory for validating that the exported sample vault opens cleanly and shows obvious graph links.",
    body:
      "Before taking screenshots, export the demo vault, open it in Obsidian, and confirm the project note links to all six captures. Graph View should show Nomi Review Demo connected to Review Safe Capture, Obsidian Export, Product Research, and Daily Recall.",
  },
];

export function demoMemoryById(id) {
  return REVIEW_DEMO_MEMORIES.find((memory) => memory.id === id);
}
