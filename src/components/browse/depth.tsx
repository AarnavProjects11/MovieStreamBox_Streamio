import { useRef, type ComponentPropsWithoutRef } from "react";

const reduceMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/**
 * A surface that tilts toward the pointer, with its inner layers pushed along Z
 * so artwork and captions parallax apart. Mouse only: on touch the tilt is
 * sticky, and on a D-pad there is no pointer at all — keyboard users get the
 * focus lift from `.tilt:focus-within` instead.
 */
export function Tilt3D({
  children,
  className = "",
  max = 5,
  ...rest
}: { children: React.ReactNode; className?: string; max?: number } & ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reduceMotion()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(px * max * 2).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-py * max * 2).toFixed(2)}deg`);
    el.dataset.lift = "true";
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--ry");
    el.style.removeProperty("--rx");
    delete el.dataset.lift;
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      className={`tilt ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The fixed colour field the whole app floats on. Decorative, so aria-hidden. */
export function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient__blob ambient__blob--a" />
      <span className="ambient__blob ambient__blob--b" />
      <span className="ambient__blob ambient__blob--c" />
      <span className="ambient__grain" />
    </div>
  );
}