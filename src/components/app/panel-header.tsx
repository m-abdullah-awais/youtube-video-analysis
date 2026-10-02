import type { ReactNode } from "react";

export function PanelHeader({
  id,
  title,
  description,
  actions,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
