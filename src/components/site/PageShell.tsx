import type { ReactNode } from 'react';

export function PageShell({
  label,
  title,
  lead,
  children,
}: {
  label: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-pub">
      <div className="wrap">
        <div className="pp-head">
          <span className="label">{label}</span>
          <h1 className="h1">{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
