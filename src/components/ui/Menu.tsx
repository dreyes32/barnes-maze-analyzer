import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function Menu({
  label,
  children,
  ariaLabel,
}: {
  label: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const button = ref.current?.querySelector("button");
    const panel = panelRef.current;
    if (!button || !panel) return;

    const place = () => {
      const br = button.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const margin = 8;
      let left = br.right - width;
      if (left < margin) left = br.left;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      let top = br.bottom + 4;
      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, br.top - height - 4);
      }
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn-ghost btn-icon"
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="menu-panel"
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
