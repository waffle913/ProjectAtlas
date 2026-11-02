import { useEffect,useId,useRef,type ReactNode } from 'react';
import './MenuTheme.css';

export function MenuDialog({title,label,onCancel,children}:{title:string;label:string;onCancel:()=>void;children:ReactNode}){
  const box=useRef<HTMLDivElement>(null);const heading=useId();
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const target=box.current!;
    (target.querySelector('input,button:not([disabled]),[tabindex="0"]') as HTMLElement|null)?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};},[]);
  return <div className="menu-overlay" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}
    if(e.key==='Tab'){
      const items=[...box.current!.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')];
      const index=items.indexOf(document.activeElement as HTMLElement);
      if(items.length && ((e.shiftKey && index<=0)||(!e.shiftKey && index===items.length-1))){e.preventDefault();items[e.shiftKey?items.length-1:0].focus();}
    }
  }}><div ref={box} className="menu-dialog" role="dialog" aria-modal="true" aria-label={label}>
    <h1 id={heading}>{title}</h1>{children}
  </div></div>;
}
