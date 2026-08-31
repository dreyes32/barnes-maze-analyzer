export type GrayImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export function createGray(width: number, height: number, fill = 0): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(fill) };
}

export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const out = createGray(width, height);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    out.data[j] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  }
  return out;
}

export function cloneGray(image: GrayImage): GrayImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

export function pixelIndex(image: GrayImage, x: number, y: number): number {
  return y * image.width + x;
}

export function inBounds(image: GrayImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < image.width && y < image.height;
}

export function downsampleGray(image: GrayImage, scale: number): GrayImage {
  if (scale === 1) return cloneGray(image);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = createGray(width, height);
  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(image.height - 1, Math.round(y / scale));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(image.width - 1, Math.round(x / scale));
      out.data[y * width + x] = image.data[srcY * image.width + srcX];
    }
  }
  return out;
}

export function pixelwiseMedian(frames: GrayImage[]): GrayImage {
  if (frames.length === 0) throw new Error("Need at least one frame for a background estimate.");
  const { width, height } = frames[0];
  const out = createGray(width, height);
  const column = new Uint8Array(frames.length);
  const mid = Math.floor(frames.length / 2);
  for (let i = 0; i < width * height; i += 1) {
    for (let f = 0; f < frames.length; f += 1) column[f] = frames[f].data[i];
    column.sort();
    out.data[i] = frames.length % 2 === 0 ? Math.round((column[mid - 1] + column[mid]) / 2) : column[mid];
  }
  return out;
}

export function absDiff(a: GrayImage, b: GrayImage): GrayImage {
  const out = createGray(a.width, a.height);
  for (let i = 0; i < a.data.length; i += 1) {
    out.data[i] = Math.abs(a.data[i] - b.data[i]);
  }
  return out;
}

export function otsuThreshold(image: GrayImage, mask?: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  let total = 0;
  for (let i = 0; i < image.data.length; i += 1) {
    if (mask && mask[i] === 0) continue;
    hist[image.data[i]] += 1;
    total += 1;
  }
  if (total === 0) return 30;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 30;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return Math.max(8, threshold);
}

export function thresholdGray(image: GrayImage, value: number, mask?: Uint8Array): Uint8Array {
  const out = new Uint8Array(image.data.length);
  for (let i = 0; i < image.data.length; i += 1) {
    if (mask && mask[i] === 0) {
      out[i] = 0;
    } else {
      out[i] = image.data[i] >= value ? 1 : 0;
    }
  }
  return out;
}

export function platformMask(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      mask[y * width + x] = dx * dx + dy * dy <= r2 ? 1 : 0;
    }
  }
  return mask;
}

function morph(
  binary: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: "erode" | "dilate",
): Uint8Array {
  if (radius <= 0) return binary.slice();
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = mode === "erode";
      outer: for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            if (mode === "erode") {
              keep = false;
              break outer;
            }
            continue;
          }
          const value = binary[ny * width + nx];
          if (mode === "dilate" && value) {
            keep = true;
            break outer;
          }
          if (mode === "erode" && !value) {
            keep = false;
            break outer;
          }
        }
      }
      out[y * width + x] = keep ? 1 : 0;
    }
  }
  return out;
}

export function morphologicalOpen(
  binary: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  return morph(morph(binary, width, height, radius, "erode"), width, height, radius, "dilate");
}

export function morphologicalClose(
  binary: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  return morph(morph(binary, width, height, radius, "dilate"), width, height, radius, "erode");
}

export type Component = {
  id: number;
  pixels: Array<{ x: number; y: number }>;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  sumIntensity: number;
};

export function connectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  intensity?: Uint8ClampedArray,
): Component[] {
  const seen = new Uint8Array(binary.length);
  const components: Component[] = [];
  const stack: number[] = [];
  let nextId = 1;
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || seen[start]) continue;
    const pixels: Array<{ x: number; y: number }> = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let sumIntensity = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push({ x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      sumIntensity += intensity?.[index] ?? 1;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= binary.length || seen[neighbor] || !binary[neighbor]) continue;
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (pixels.length < 8) continue;
    components.push({
      id: nextId,
      pixels,
      area: pixels.length,
      minX,
      minY,
      maxX,
      maxY,
      sumX,
      sumY,
      sumIntensity,
    });
    nextId += 1;
  }
  return components;
}

/**
 * Distance-transform weighted centroid. Pixels deep inside the blob
 * (body core) outweigh the thin tail.
 */
export function coreCentroid(component: Component, width: number, height: number): { x: number; y: number } {
  const mask = new Uint8Array(width * height);
  for (const pixel of component.pixels) mask[pixel.y * width + pixel.x] = 1;
  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  for (const pixel of component.pixels) {
    let minDist = 8;
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const nx = pixel.x + dx;
        const ny = pixel.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
          minDist = Math.min(minDist, Math.hypot(dx, dy));
        }
      }
    }
    const weight = minDist * minDist;
    sumW += weight;
    sumX += pixel.x * weight;
    sumY += pixel.y * weight;
  }
  if (sumW === 0) {
    return { x: component.sumX / component.area, y: component.sumY / component.area };
  }
  return { x: sumX / sumW, y: sumY / sumW };
}

export function rawCentroid(component: Component): { x: number; y: number } {
  return { x: component.sumX / component.area, y: component.sumY / component.area };
}

export function principalAxis(component: Component): {
  centroid: { x: number; y: number };
  axis: { x: number; y: number };
  endpoints: [{ x: number; y: number }, { x: number; y: number }];
} {
  const centroid = rawCentroid(component);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const pixel of component.pixels) {
    const dx = pixel.x - centroid.x;
    const dy = pixel.y - centroid.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const axis = { x: Math.cos(theta), y: Math.sin(theta) };
  let minProj = Number.POSITIVE_INFINITY;
  let maxProj = Number.NEGATIVE_INFINITY;
  let minPt = centroid;
  let maxPt = centroid;
  for (const pixel of component.pixels) {
    const proj = (pixel.x - centroid.x) * axis.x + (pixel.y - centroid.y) * axis.y;
    if (proj < minProj) {
      minProj = proj;
      minPt = pixel;
    }
    if (proj > maxProj) {
      maxProj = proj;
      maxPt = pixel;
    }
  }
  return { centroid, axis, endpoints: [minPt, maxPt] };
}

export function meanInside(image: GrayImage, cx: number, cy: number, radius: number): number {
  let sum = 0;
  let n = 0;
  const r = Math.ceil(radius);
  for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y += 1) {
    for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x += 1) {
      if (!inBounds(image, x, y)) continue;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) {
        sum += image.data[pixelIndex(image, x, y)];
        n += 1;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

export function darkestLocalCenter(
  image: GrayImage,
  seed: { x: number; y: number },
  searchRadius: number,
  holeRadius: number,
): { x: number; y: number; score: number } {
  let best = { x: seed.x, y: seed.y, score: Number.POSITIVE_INFINITY };
  const step = 1;
  for (let y = seed.y - searchRadius; y <= seed.y + searchRadius; y += step) {
    for (let x = seed.x - searchRadius; x <= seed.x + searchRadius; x += step) {
      if (!inBounds(image, Math.round(x), Math.round(y))) continue;
      const score = meanInside(image, x, y, holeRadius);
      if (score < best.score) best = { x, y, score };
    }
  }
  return best;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function rayRadii(image: GrayImage, cx: number, cy: number, brightMin: number): number[] {
  const radii: number[] = [];
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    let lastBright = 0;
    const limit = Math.min(image.width, image.height) / 2;
    for (let r = 8; r < limit; r += 1) {
      const x = Math.round(cx + r * Math.cos(angle));
      const y = Math.round(cy + r * Math.sin(angle));
      if (!inBounds(image, x, y)) break;
      if (image.data[pixelIndex(image, x, y)] >= brightMin) lastBright = r;
      else if (lastBright >= 40 && r - lastBright >= 3) break;
    }
    if (lastBright >= 40) radii.push(lastBright);
  }
  return radii;
}

/**
 * Estimate the bright circular platform. Prefer radial brightness falloff from
 * a center near the image middle — more stable than a global bright blob when
 * walls, cables, or a center hotspot compete with the maze.
 */
export function estimateBrightCircle(image: GrayImage): { x: number; y: number; radius: number } | null {
  const brightMin = Math.max(110, otsuThreshold(image) - 15);
  let best = { x: image.width / 2, y: image.height / 2, score: -1, radius: 0 };
  for (let dy = -40; dy <= 40; dy += 8) {
    for (let dx = -40; dx <= 40; dx += 8) {
      const cx = image.width / 2 + dx;
      const cy = image.height / 2 + dy;
      const radii = rayRadii(image, cx, cy, brightMin);
      if (radii.length < 24) continue;
      const radius = medianNumber(radii);
      const spread = medianNumber(radii.map((value) => Math.abs(value - radius)));
      const score = radii.length - spread * 2;
      if (score > best.score) best = { x: cx, y: cy, radius, score };
    }
  }
  if (best.score < 0 || best.radius < 60) {
    const threshold = otsuThreshold(image);
    const binary = thresholdGray(image, Math.max(threshold, 140));
    const components = connectedComponents(binary, image.width, image.height);
    if (components.length === 0) return null;
    const largest = components.reduce((winner, item) => (item.area > winner.area ? item : winner));
    return {
      x: largest.sumX / largest.area,
      y: largest.sumY / largest.area,
      radius: Math.max(60, Math.sqrt(largest.area / Math.PI)),
    };
  }
  return { x: best.x, y: best.y, radius: best.radius };
}
