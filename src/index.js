const { fetchAllActiveProducts, getTotalInventory, archiveProduct } = require("./shopify");
const { notifySummary, notifyException } = require("./slack");

async function run() {
  console.log(`[ARCHIVE] Started at ${new Date().toISOString()}`);

  if (!process.env.SHOP_DOMAIN || !process.env.SHOPIFY_ACCESS_TOKEN) {
    console.error("[ARCHIVE] Missing SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN");
    process.exit(1);
  }

  try {
    console.log("[ARCHIVE] Fetching active products...");
    const products = await fetchAllActiveProducts();
    console.log(`[ARCHIVE] Found ${products.length} active products`);

    const nonGiftCards = products.filter((p) => {
      // Shopify gift cards have a boolean gift_card field
      if (p.gift_card === true) return false;
      // Also check product_type as a fallback
      const pt = (p.product_type || "").toLowerCase();
      if (pt === "gift card" || pt === "gift_card" || pt === "gift cards") return false;
      // Also check the title for gift card products
      const title = (p.title || "").toLowerCase();
      if (title.includes("gift card")) return false;
      return true;
    });
    const skippedGiftCards = products.length - nonGiftCards.length;
    console.log(`[ARCHIVE] Skipped ${skippedGiftCards} gift cards`);

    // Exclude "Custom Denim Cut" products from archiving
    const eligible = nonGiftCards.filter((p) => {
      const title = (p.title || "").toLowerCase();
      return !title.includes("custom denim cut");
    });
    const skippedCustomDenim = nonGiftCards.length - eligible.length;
    console.log(`[ARCHIVE] Skipped ${skippedCustomDenim} Custom Denim Cut products`);

    const zeroStock = eligible.filter((p) => getTotalInventory(p) <= 0);
    console.log(`[ARCHIVE] Found ${zeroStock.length} products with zero stock`);

    const results = [];
    for (const product of zeroStock) {
      try {
        await archiveProduct(product.id);
        console.log(`[ARCHIVE] Archived: ${product.title} (ID: ${product.id})`);
        results.push({ productId: product.id, title: product.title, archived: true });
      } catch (err) {
        console.error(`[ARCHIVE] Failed to archive ${product.title}: ${err.message}`);
        results.push({ productId: product.id, title: product.title, archived: false, error: err.message });
        await notifyException({ productId: product.id, title: product.title, error: err.message }).catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const archived = results.filter((r) => r.archived).length;
    const failed = results.filter((r) => !r.archived).length;

    const summary = { totalActive: products.length, archived, failed, skippedGiftCards, skippedCustomDenim, results };
    console.log(`[ARCHIVE] Complete: ${archived} archived, ${failed} failed, ${skippedGiftCards} gift cards skipped, ${skippedCustomDenim} Custom Denim Cut skipped`);

    await notifySummary(summary).catch((err) => {
      console.error(`[ARCHIVE] Slack notification failed: ${err.message}`);
    });
  } catch (err) {
    console.error(`[ARCHIVE] Fatal error: ${err.message}`);
    await notifyException({ productId: "N/A", title: "Archive Run Failed", error: err.message }).catch(() => {});
    process.exit(1);
  }

  console.log(`[ARCHIVE] Finished at ${new Date().toISOString()}`);
}

run();
