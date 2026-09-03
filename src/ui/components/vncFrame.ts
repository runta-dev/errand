export function canvasHasVisualFrame(canvas: HTMLCanvasElement): boolean {
  if (canvas.width <= 0 || canvas.height <= 0) return false;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return false;
    const xs = [0, Math.floor(canvas.width / 2), canvas.width - 1]; const ys = [0, Math.floor(canvas.height / 2), canvas.height - 1];
    const samples = xs.flatMap((x) => ys.map((y) => context.getImageData(x, y, 1, 1).data));
    if (samples.every((pixel) => pixel[3] === 0)) return false;
    for (let channel = 0; channel < 3; channel += 1) {
      const values = samples.map((pixel) => pixel[channel]);
      if (Math.max(...values) - Math.min(...values) > 6) return true;
    }
    return false;
  } catch { return false; }
}
