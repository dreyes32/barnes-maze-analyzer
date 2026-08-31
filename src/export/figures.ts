export function downloadSvg(svg: Element, filename: string): void {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`;
  const blob = new Blob([text], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadPngFromSvg(svg: Element, filename: string, scale = 2): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const box = svg.getBoundingClientRect();
  const width = Math.max(640, box.width * scale);
  const height = Math.max(480, box.height * scale);
  const blob = new Blob([clone.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not rasterize the figure."));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a canvas for PNG export.");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(url);
  canvas.toBlob((png) => {
    if (!png) return;
    const pngUrl = URL.createObjectURL(png);
    const anchor = document.createElement("a");
    anchor.href = pngUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(pngUrl);
  }, "image/png");
}
