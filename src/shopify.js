const API_VERSION = "2024-10";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
  };
}

function getBaseUrl() {
  return `https://${process.env.SHOP_DOMAIN}/admin/api/${API_VERSION}`;
}

async function fetchAllActiveProducts() {
  const products = [];
  let url = `${getBaseUrl()}/products.json?status=active&limit=250`;

  while (url) {
    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API error (${response.status}): ${body}`);
    }

    const data = await response.json();
    products.push(...data.products);

    const linkHeader = response.headers.get("link");
    url = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
  }

  return products;
}

function getTotalInventory(product) {
  if (!product.variants || product.variants.length === 0) {
    return 0;
  }
  return product.variants.reduce((sum, variant) => {
    return sum + (variant.inventory_quantity || 0);
  }, 0);
}

async function archiveProduct(productId) {
  const url = `${getBaseUrl()}/products/${productId}.json`;

  const response = await fetch(url, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({
      product: {
        id: productId,
        status: "archived",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to archive product ${productId} (${response.status}): ${body}`);
  }

  return (await response.json()).product;
}

module.exports = { fetchAllActiveProducts, getTotalInventory, archiveProduct };
