/**
 * Cloudflare Worker: RIAPI → Cloudflare Image Resizing proxy
 *
 * Deploy on media.interleaved.app. Translates RIAPI/Imageflow query strings
 * into Cloudflare's cf.image options transparently. All HTML uses standard
 * RIAPI syntax (?w=800&format=webp), this worker handles the translation.
 *
 * When you later swap to a real Imageflow server, remove this worker and
 * point the domain at Imageflow — same URLs, zero HTML changes.
 *
 * RIAPI params supported:
 *   w, width     → width
 *   h, height    → height
 *   mode         → fit (max→scale-down, crop→crop, pad→pad, stretch→contain)
 *   format       → format (webp, avif, json, auto)
 *   quality      → quality (1-100)
 *   blur         → blur (1-250)
 *   sharpen      → sharpen (0-10)
 *   bgcolor      → background
 *   trim.threshold → trim (Cloudflare threshold)
 *
 * Requests without RIAPI params pass through to R2 unchanged.
 *
 * Setup:
 *   1. wrangler deploy workers/riapi-proxy.js --name riapi-proxy
 *   2. Add route: media.interleaved.app/* → riapi-proxy worker
 *   Or use wrangler.toml (see below)
 */

const MODE_MAP = {
  max: "scale-down",
  crop: "crop",
  pad: "pad",
  stretch: "contain",
  carve: "scale-down", // no equivalent, fallback
};

const FORMAT_MAP = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const params = url.searchParams;

    // If no image transform params, pass through to origin
    const hasTransforms = ["w", "width", "h", "height", "mode", "format",
      "quality", "blur", "sharpen", "bgcolor"].some(k => params.has(k));

    if (!hasTransforms) {
      // Pass through — fetch from R2 origin
      return fetch(request);
    }

    // Build Cloudflare image options
    const cfImage = {};

    const w = params.get("w") || params.get("width");
    const h = params.get("h") || params.get("height");
    const mode = params.get("mode");
    const format = params.get("format");
    const quality = params.get("quality");
    const blur = params.get("blur");
    const sharpen = params.get("sharpen");
    const bgcolor = params.get("bgcolor") || params.get("s.roundcorners");

    if (w) cfImage.width = parseInt(w, 10);
    if (h) cfImage.height = parseInt(h, 10);
    if (mode && MODE_MAP[mode]) cfImage.fit = MODE_MAP[mode];
    else if (w && h) cfImage.fit = "cover"; // default when both dimensions specified
    else cfImage.fit = "scale-down"; // default: don't upscale

    if (format) {
      const mapped = FORMAT_MAP[format.toLowerCase()];
      if (mapped) cfImage.format = mapped;
      else if (format === "auto") cfImage.format = "auto";
    }

    if (quality) cfImage.quality = Math.min(100, Math.max(1, parseInt(quality, 10)));
    if (blur) cfImage.blur = Math.min(250, Math.max(1, parseInt(blur, 10)));
    if (sharpen) cfImage.sharpen = Math.min(10, Math.max(0, parseFloat(sharpen)));
    if (bgcolor) cfImage.background = bgcolor.startsWith("#") ? bgcolor : `#${bgcolor}`;

    // Strip query params and fetch the original image with cf.image
    const originUrl = new URL(url.pathname, url.origin);
    const imageRequest = new Request(originUrl.toString(), {
      headers: request.headers,
    });

    return fetch(imageRequest, {
      cf: { image: cfImage },
    });
  },
};
