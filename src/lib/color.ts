let canvas: CanvasRenderingContext2D | null = null;

/**
 * `#rrggbb` for any CSS color the browser understands (oklch, hsl, named…), for the color picker, which
 * only speaks hex; the alpha channel is dropped. `null` when `value` is not a color.
 */
export function cssColorToHex(value: string): string | null {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return null;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "#010203"; // a sentinel: if `value` is invalid, fillStyle keeps this
  canvas.fillStyle = value;
  if (canvas.fillStyle === "#010203" && value.trim().toLowerCase() !== "#010203") return null;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
