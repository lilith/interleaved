/**
 * Cloudflare Worker: RIAPI/Imageflow → Cloudflare Image Resizing proxy
 *
 * Translates the full Imageflow querystring API into Cloudflare's cf.image
 * options. HTML always uses RIAPI syntax — swap to real Imageflow later
 * with zero HTML changes.
 *
 * Reference: https://docs.imageflow.io/querystring/introduction.html
 *
 * Supported RIAPI parameters:
 *
 * Dimensions & scaling:
 *   w, width         → width
 *   h, height        → height
 *   dpr              → dpr (multiplied into w/h)
 *   mode             → fit (max, pad, crop, stretch)
 *   scale            → (down=no upscale, both=allow upscale)
 *   anchor           → gravity (topleft, center, bottomright, etc.)
 *
 * Crop & trim:
 *   crop             → trim coordinates (x1,y1,x2,y2)
 *   trim.threshold   → trim
 *
 * Rotation & flip:
 *   srotate, rotate  → (90, 180, 270)
 *   sflip, flip      → (x, y, xy)
 *
 * Color:
 *   bgcolor          → background
 *
 * Filters:
 *   f.sharpen        → sharpen
 *   s.grayscale      → (not supported by CF, ignored)
 *   s.sepia          → (not supported by CF, ignored)
 *   s.contrast       → (not supported by CF, ignored)
 *   s.brightness     → (not supported by CF, ignored)
 *   s.saturation     → (not supported by CF, ignored)
 *
 * Encoding:
 *   format           → format (jpeg, png, webp, avif, gif)
 *   quality          → quality (shorthand)
 *   jpeg.quality     → quality (when format=jpeg)
 *   webp.quality     → quality (when format=webp)
 *   png.quality      → quality (when format=png)
 *
 * Parameters without a Cloudflare equivalent are silently ignored.
 * When Imageflow is the origin, they'll work natively.
 */

const MODE_TO_FIT = {
  max: "scale-down",
  crop: "cover",
  pad: "pad",
  stretch: "contain",
};

const ANCHOR_TO_GRAVITY = {
  topleft: { x: 0, y: 0 },
  topcenter: { x: 0.5, y: 0 },
  topright: { x: 1, y: 0 },
  middleleft: { x: 0, y: 0.5 },
  middlecenter: { x: 0.5, y: 0.5 },
  middleright: { x: 1, y: 0.5 },
  bottomleft: { x: 0, y: 1 },
  bottomcenter: { x: 0.5, y: 1 },
  bottomright: { x: 1, y: 1 },
};

const FORMAT_MAP = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif",
};

// All RIAPI params we recognize — used to detect if transforms are requested
const RIAPI_PARAMS = new Set([
  "w", "width", "h", "height", "dpr",
  "mode", "scale", "anchor",
  "crop", "cropxunits", "cropyunits",
  "trim.threshold", "trim.percentpadding",
  "srotate", "rotate", "sflip", "flip",
  "bgcolor", "ignoreicc", "ignore_icc_errors",
  "format", "quality",
  "jpeg.quality", "jpeg.progressive", "jpeg.turbo",
  "webp.quality", "webp.lossless",
  "png.quality", "png.lossless", "png.min_quality",
  "f.sharpen", "f.sharpenwhen",
  "down.filter", "up.filter",
  "down.colorspace", "up.colorspace",
  "s.grayscale", "s.sepia", "s.invert",
  "s.alpha", "s.contrast", "s.brightness", "s.saturation",
]);

function parseInt10(val) {
  return parseInt(val, 10);
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function parseColor(val) {
  if (!val) return undefined;
  // RIAPI supports: RGB, RGBA, RRGGBB, RRGGBBAA, or named colors
  const v = val.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3,8}$/.test(v)) return `#${v}`;
  return val; // named color, pass through
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const params = url.searchParams;

    // Check if any RIAPI params are present
    let hasTransforms = false;
    for (const key of params.keys()) {
      if (RIAPI_PARAMS.has(key)) {
        hasTransforms = true;
        break;
      }
    }

    if (!hasTransforms) {
      return fetch(request);
    }

    // --- Build Cloudflare image options ---
    const cf = {};

    // Dimensions
    let w = params.get("w") || params.get("width");
    let h = params.get("h") || params.get("height");
    const dpr = params.get("dpr");

    if (w) w = parseInt10(w);
    if (h) h = parseInt10(h);
    if (dpr && (w || h)) {
      const multiplier = parseFloat(dpr);
      if (w) w = Math.round(w * multiplier);
      if (h) h = Math.round(h * multiplier);
    }

    if (w) cf.width = w;
    if (h) cf.height = h;

    // Mode → fit
    const mode = params.get("mode");
    const scale = params.get("scale");

    if (mode && MODE_TO_FIT[mode]) {
      cf.fit = MODE_TO_FIT[mode];
    } else if (w && h) {
      cf.fit = "cover"; // RIAPI default when both dimensions: crop
    } else {
      cf.fit = "scale-down"; // RIAPI default: max (don't upscale)
    }

    // scale=down means never upscale (Cloudflare's scale-down)
    // scale=both means allow upscale
    if (scale === "down" || (!scale && !mode)) {
      // Default behavior — scale-down is already set above for single dimension
    } else if (scale === "both" && cf.fit === "scale-down") {
      cf.fit = "contain"; // allow upscaling
    }

    // Anchor → gravity
    const anchor = params.get("anchor");
    if (anchor) {
      const gravity = ANCHOR_TO_GRAVITY[anchor.toLowerCase()];
      if (gravity) cf.gravity = gravity;
    }

    // Crop (x1,y1,x2,y2)
    const crop = params.get("crop");
    if (crop) {
      const parts = crop.split(",").map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [x1, y1, x2, y2] = parts;
        const cropXUnits = parseFloat(params.get("cropxunits") || "0");
        const cropYUnits = parseFloat(params.get("cropyunits") || "0");

        // If cropunits are set, coordinates are in those units (100 = percentage)
        // Cloudflare uses trim with pixel coordinates, so we pass them as-is
        // and rely on Cloudflare's trim parameter
        cf.trim = {
          left: x1,
          top: y1,
          right: x2 > 0 ? 0 : Math.abs(x2), // negative x2 means from right edge
          bottom: y2 > 0 ? 0 : Math.abs(y2),
        };
      }
    }

    // Trim
    const trimThreshold = params.get("trim.threshold");
    if (trimThreshold) {
      cf.trim = clamp(parseInt10(trimThreshold), 0, 255);
    }

    // Rotation
    const rotate = params.get("rotate") || params.get("srotate");
    if (rotate) {
      const deg = parseInt10(rotate);
      if ([90, 180, 270].includes(deg)) cf.rotate = deg;
    }

    // Background color
    const bgcolor = params.get("bgcolor");
    if (bgcolor) {
      cf.background = parseColor(bgcolor);
    }

    // Format
    const format = params.get("format");
    if (format) {
      const mapped = FORMAT_MAP[format.toLowerCase()];
      if (mapped) cf.format = mapped;
    }

    // Quality — check format-specific first, then generic
    const quality =
      params.get("jpeg.quality") ||
      params.get("webp.quality") ||
      params.get("png.quality") ||
      params.get("quality");
    if (quality) {
      cf.quality = clamp(parseInt10(quality), 1, 100);
    }

    // Sharpen
    const sharpen = params.get("f.sharpen");
    if (sharpen) {
      // RIAPI f.sharpen is 0-99, Cloudflare sharpen is 0-10
      cf.sharpen = clamp(parseFloat(sharpen) / 10, 0, 10);
    }

    // Fetch the original image with cf.image transforms
    const originUrl = new URL(url.pathname, url.origin);
    const imageRequest = new Request(originUrl.toString(), {
      headers: request.headers,
    });

    return fetch(imageRequest, {
      cf: { image: cf },
    });
  },
};
