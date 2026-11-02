import { cn } from "@/lib/utils";

interface Props {
  /** `x` redimensiona a largura (alça vertical), `y` a altura (alça horizontal). */
  axis: "x" | "y";
  size: number;
  min: number;
  max?: number;
  onChange: (size: number) => void;
}

/** Alça arrastável posicionada na borda direita/inferior do pai (que precisa ser `relative`). */
export function ResizeHandle({ axis, size, min, max = Infinity, onChange }: Props) {
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const start = axis === "x" ? e.clientX : e.clientY;
    const startSize = size;
    el.setPointerCapture(e.pointerId);
    // Sem isso o arraste seleciona o texto (ex.: o do editor) por onde o ponteiro passa.
    e.preventDefault();
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const delta = (axis === "x" ? ev.clientX : ev.clientY) - start;
      onChange(Math.round(Math.min(max, Math.max(min, startSize + delta))));
    };
    const stop = () => {
      document.body.style.userSelect = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  }

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "absolute z-10 touch-none transition-colors hover:bg-primary/40 active:bg-primary/60",
        axis === "x" ? "inset-y-0 -right-1 w-2 cursor-col-resize" : "inset-x-0 -bottom-1 h-2 cursor-row-resize",
      )}
    />
  );
}
