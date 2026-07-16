import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export function comparePng(referenceBytes, candidateBytes, options = {}) {
  const reference = PNG.sync.read(Buffer.from(referenceBytes));
  const candidate = PNG.sync.read(Buffer.from(candidateBytes));
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    return {
      dimensionsMatch: false,
      referenceSize: { width: reference.width, height: reference.height },
      candidateSize: { width: candidate.width, height: candidate.height },
      mismatchPixels: reference.width * reference.height,
      mismatchRatio: 1,
      hotspot: { x: 0, y: 0, width: Math.max(reference.width, candidate.width), height: Math.max(reference.height, candidate.height) }
    };
  }

  const referenceData = Buffer.from(reference.data);
  const candidateData = Buffer.from(candidate.data);
  for (const rect of options.maskRects ?? []) {
    maskRect(referenceData, reference.width, reference.height, rect);
    maskRect(candidateData, candidate.width, candidate.height, rect);
  }
  const diff = new PNG({ width: reference.width, height: reference.height });
  const mismatchPixels = pixelmatch(referenceData, candidateData, diff.data, reference.width, reference.height, {
    threshold: options.colorThreshold ?? 0.1,
    includeAA: false,
    diffMask: true
  });
  const mismatchRatio = mismatchPixels / Math.max(1, reference.width * reference.height);
  return {
    dimensionsMatch: true,
    referenceSize: { width: reference.width, height: reference.height },
    candidateSize: { width: candidate.width, height: candidate.height },
    mismatchPixels,
    mismatchRatio,
    hotspot: findDiffBounds(diff.data, diff.width, diff.height),
    diffBytes: PNG.sync.write(diff)
  };
}

export function cssRectsToPixelRects(rects, deviceScaleFactor, width, height) {
  return rects.map((rect) => ({
    x: clamp(Math.floor(rect.x * deviceScaleFactor), 0, width),
    y: clamp(Math.floor(rect.y * deviceScaleFactor), 0, height),
    width: clamp(Math.ceil(rect.width * deviceScaleFactor), 0, width),
    height: clamp(Math.ceil(rect.height * deviceScaleFactor), 0, height)
  })).filter((rect) => rect.width > 0 && rect.height > 0);
}

function maskRect(data, width, height, rect) {
  const startX = clamp(Math.floor(rect.x), 0, width);
  const startY = clamp(Math.floor(rect.y), 0, height);
  const endX = clamp(Math.ceil(rect.x + rect.width), 0, width);
  const endY = clamp(Math.ceil(rect.y + rect.height), 0, height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }
}

function findDiffBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!data[offset + 3]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? undefined : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
