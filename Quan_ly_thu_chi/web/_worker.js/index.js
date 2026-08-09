// Cloudflare Worker entry — serve SPA với fallback cho React Router.
// `_worker.js` là convention của Wrangler khi dùng `[assets]` với custom worker.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assets = env.ASSETS;

    // Thử serve asset tĩnh trước (HTML/CSS/JS/images).
    const assetResponse = await assets.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // SPA fallback: mọi route không tìm thấy asset → trả về index.html.
    // Cần thiết cho React Router (client-side routing).
    const indexRequest = new Request(new URL('/index.html', url), request);
    const indexResponse = await assets.fetch(indexRequest);
    return indexResponse;
  },
};
