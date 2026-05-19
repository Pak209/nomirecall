const { runScheduledXBookmarkSync, syncXBookmarksForUser } = require('./server');

async function runDailyXBookmarkSyncForUser(userId, options = {}) {
  return syncXBookmarksForUser(userId, {
    mode: 'daily',
    limit: options.limit || 100,
    processWithAI: options.processWithAI === true,
  });
}

module.exports = {
  runDailyXBookmarkSyncForUser,
  runScheduledXBookmarkSync,
};
