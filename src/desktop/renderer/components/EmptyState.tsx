import type { ReactNode } from 'react';
export function EmptyState({title,description,children}:{title:string;description:string;children?:ReactNode}) {
 return <div className="workspaceEmpty"><span className="workspaceEmptyMark" aria-hidden="true">◇</span><h2>{title}</h2><p>{description}</p>{children&&<div className="workspaceEmptyActions">{children}</div>}</div>;
}
