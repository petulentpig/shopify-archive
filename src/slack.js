const https = require("https");

function sendSlackMessage(payload) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not set — skipping notification");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(webhookUrl);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else {
          reject(new Error(`Slack returned ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function notifySummary({ totalActive, archived, failed, skippedGiftCards, skippedCustomDenim, results }) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "📦 Shopify Archive Run" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Active Products Scanned:*\n${totalActive}` },
        { type: "mrkdwn", text: `*Gift Cards Skipped:*\n${skippedGiftCards}` },
        { type: "mrkdwn", text: `*Custom Denim Cut Skipped:*\n${skippedCustomDenim}` },
        { type: "mrkdwn", text: `*Archived (0 stock):*\n${archived}` },
        { type: "mrkdwn", text: `*Failed:*\n${failed}` },
      ],
    },
  ];

  if (results.length > 0) {
    const archivedList = results
      .filter((r) => r.archived)
      .slice(0, 20)
      .map((r) => `• ${r.title}`)
      .join("\n");

    if (archivedList) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Archived Products:*\n${archivedList}${results.filter((r) => r.archived).length > 20 ? `\n_...and ${results.filter((r) => r.archived).length - 20} more_` : ""}`,
        },
      });
    }
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Run completed at ${new Date().toISOString()}` }],
  });

  return sendSlackMessage({ blocks });
}

async function notifyException({ productId, title, error }) {
  return sendSlackMessage({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Archive Failed*\nProduct: *${title}* (ID: ${productId})\nError: ${error}`,
        },
      },
    ],
  });
}

module.exports = { sendSlackMessage, notifySummary, notifyException };
