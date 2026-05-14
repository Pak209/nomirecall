const UPDATED_AT = 'May 12, 2026';

function pageShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Nomi Recall</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f1d24;
      background: #fff8f4;
    }
    body {
      margin: 0;
      padding: 32px 20px 56px;
      line-height: 1.6;
    }
    main {
      max-width: 840px;
      margin: 0 auto;
    }
    h1 {
      font-size: clamp(2rem, 6vw, 3.5rem);
      line-height: 1.05;
      margin: 0 0 8px;
    }
    h2 {
      margin-top: 32px;
      line-height: 1.2;
    }
    p, li {
      font-size: 1rem;
    }
    .updated {
      color: #736b73;
      margin-bottom: 28px;
    }
    a {
      color: #d92d61;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

function privacyPolicyPage() {
  return pageShell('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: ${UPDATED_AT}</p>

    <p>Nomi Recall helps you save notes, links, X posts, images, voice captures, and related memory details so you can find them later. This policy explains what the app collects and how the current Nomi Recall services use that information.</p>

    <h2>Information We Collect</h2>
    <ul>
      <li>Account information, such as your email address, user ID, onboarding state, settings, and selected interests.</li>
      <li>User content you choose to save, including notes, pasted links, imported X post text, categories, tags, summaries, media references, and source URLs.</li>
      <li>Uploaded files, such as images or voice captures, when you use capture features that store media.</li>
      <li>Purchase and entitlement status from RevenueCat, such as whether your account has access to Nomi Pro.</li>
      <li>Diagnostics and operational data needed to keep the app, backend, Firebase, and purchase services working.</li>
    </ul>

    <h2>How We Use Information</h2>
    <ul>
      <li>To authenticate your account and route you through onboarding and the main app.</li>
      <li>To save, display, edit, recall, search, export, and delete your memories.</li>
      <li>To import public X post information when you paste a supported X link or use discovery features.</li>
      <li>To check purchase status and unlock subscription features through RevenueCat and Apple.</li>
      <li>To troubleshoot errors, protect the service, and improve product reliability.</li>
    </ul>

    <h2>Services We Use</h2>
    <p>Nomi Recall uses Firebase for authentication, Firestore database records, and Storage files. RevenueCat is used for subscription and entitlement management. The Nomi backend may process links or public X post URLs you submit so the app can fetch post text, author, date, links, and media metadata where available.</p>

    <h2>X Import and Backend Processing</h2>
    <p>When you import or discover X posts, the URL and related request data may be sent to the Nomi backend. The backend may call the X API and store returned public post details in your account if you save the memory. Nomi does not control X, YouTube, Reddit, Safari, Obsidian, Apple, Firebase, or RevenueCat privacy practices.</p>

    <h2>Purchases</h2>
    <p>Purchases are processed by Apple. RevenueCat helps Nomi understand whether your account has an active entitlement. Nomi does not receive your full payment card details. Deleting your Nomi account does not automatically cancel Apple billing; subscriptions must be managed from your Apple account.</p>

    <h2>Account Deletion</h2>
    <p>You can request account deletion from Settings in the app. Account deletion removes your Nomi profile, saved memories, and uploaded files that are associated with your Firebase user ID. Some records may remain temporarily in backups, logs, App Store purchase history, RevenueCat systems, or other service provider records as required for security, fraud prevention, accounting, or legal obligations.</p>

    <h2>Data Sharing</h2>
    <p>We do not sell your saved memories. We share data with service providers only as needed to operate Nomi Recall, including Firebase, RevenueCat, Apple, and backend infrastructure providers.</p>

    <h2>Contact</h2>
    <p>For privacy questions, contact the app owner through the support contact listed in App Store Connect.</p>
  `);
}

function termsPage() {
  return pageShell('Terms of Use', `
    <h1>Terms of Use</h1>
    <p class="updated">Last updated: ${UPDATED_AT}</p>

    <p>These Terms of Use describe the basic rules for using Nomi Recall. They are not a substitute for legal advice, and they may be updated as the product matures.</p>

    <h2>Using Nomi Recall</h2>
    <p>You are responsible for the content you save, import, edit, export, or share through Nomi Recall. Do not use the app to store or distribute unlawful, harmful, infringing, or abusive content.</p>

    <h2>User Content</h2>
    <p>Your memories remain your responsibility. By saving content in Nomi Recall, you allow the app and its service providers to store, process, display, edit, export, and delete that content as needed to provide the service.</p>

    <h2>Imported Content and Third-Party Platforms</h2>
    <p>Nomi Recall can help import public content from X links and may later support other share sources. Imported content may be limited by third-party APIs, availability, rate limits, terms, or permissions. You are responsible for respecting third-party rights and platform rules when saving or exporting content.</p>

    <h2>Subscriptions and Purchases</h2>
    <p>Nomi Pro purchases are processed by Apple and managed through RevenueCat. Subscription availability, pricing, free trials, renewals, refunds, and cancellation are handled by Apple. Deleting your Nomi account does not cancel Apple billing; you must cancel subscriptions from your Apple account.</p>

    <h2>Obsidian and Export Features</h2>
    <p>Nomi Recall may export Markdown files for use in Obsidian, Files, iCloud Drive, AirDrop, or other destinations. You are responsible for where exported files are saved and who can access them after export.</p>

    <h2>No Guaranteed Availability</h2>
    <p>Nomi Recall is provided as-is while it is being developed. Features may change, fail, or become unavailable. Backend processing, Firebase services, RevenueCat, Apple services, X API access, and network connectivity can affect app behavior.</p>

    <h2>Account Deletion</h2>
    <p>You may delete your account from Settings. Deletion is intended to remove your profile, memories, and uploaded user files associated with your Firebase user ID, but it does not cancel Apple subscriptions or remove records Apple, RevenueCat, Firebase, hosting providers, or other service providers are required to retain.</p>

    <h2>Contact</h2>
    <p>For support or terms questions, use the support contact listed in App Store Connect.</p>
  `);
}

module.exports = {
  privacyPolicyPage,
  termsPage,
};
