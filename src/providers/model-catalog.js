async function fetchModelList({ url, headers, timeoutMs = 10_000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`Model catalog HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.data) ? body.data : [];
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueModels(models) {
  const seen = new Set();
  return models.filter(model => {
    if (!model?.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

module.exports = { fetchModelList, uniqueModels };
