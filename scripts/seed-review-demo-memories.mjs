#!/usr/bin/env node
import {
  REVIEW_DEMO_MEMORIES,
} from "./lib/reviewDemoData.mjs";

const apiBase = normalizeApiBase(process.env.NOMI_API_BASE || process.argv[2] || "http://localhost:3000/api");
const email = process.env.NOMI_DEMO_EMAIL || "review-demo@example.com";
const password = process.env.NOMI_DEMO_PASSWORD || "review-demo-password";

function normalizeApiBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function signInOrCreateDemoUser() {
  try {
    return await request("/auth/email/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    return request("/auth/email", {
      method: "POST",
      body: JSON.stringify({ email, password, intent: "signin" }),
    });
  }
}

function ingestPayload(memory) {
  return {
    title: memory.title,
    raw_text: memory.body,
    url: memory.sourceUrl || undefined,
    type: memory.type,
    category: memory.category,
    tags: memory.tags,
    authorUsername: memory.sourceUsername,
    postDate: memory.postDate || memory.createdAt,
    links: memory.links,
    media: memory.media,
    processWithAI: false,
  };
}

async function deleteExistingDemoMemories(token) {
  const { memories } = await request("/memories?tag=review-demo", {
    headers: { authorization: `Bearer ${token}` },
  });

  for (const memory of memories) {
    await request(`/memories/${encodeURIComponent(memory.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  return memories.length;
}

async function seedDemoMemories(token) {
  const created = [];
  for (const memory of REVIEW_DEMO_MEMORIES) {
    const result = await request("/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(ingestPayload(memory)),
    });
    created.push(result);
  }
  return created;
}

async function main() {
  const { token, user } = await signInOrCreateDemoUser();
  const deleted = await deleteExistingDemoMemories(token);
  const created = await seedDemoMemories(token);

  console.log(`Seeded ${created.length} review-safe demo memories at ${apiBase}.`);
  console.log(`Demo account: ${user.email}`);
  console.log(`Removed previous demo memories: ${deleted}`);
  console.log("");
  console.log("Use this account for local review screenshots only. Do not commit real App Store review credentials.");
}

main().catch((error) => {
  console.error("Failed to seed review demo memories:");
  console.error(error.message || error);
  process.exitCode = 1;
});
