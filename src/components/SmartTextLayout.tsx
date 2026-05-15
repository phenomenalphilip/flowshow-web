import React, { useMemo, useEffect, useRef, useState } from 'react';
import { tokenize, Token } from '../lib/TokenEngine';

interface SmartTextLayoutProps {
  text?: string;
  lines?: string[];
  source?: string;
  type?: 'lyrics' | 'scripture' | string;
  className?: string;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
  onWordClick?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseDown?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseEnter?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseUp?: (wordIndex: number, e: React.MouseEvent) => void;
  selectedWordIndices?: number[];
  disableAbsoluteLayout?: boolean;
}

export function SmartTextLayout({ text, lines, source, type, className = '', styleOverrides, onWordClick, onWordMouseDown, onWordMouseEnter, onWordMouseUp, selectedWordIndices, disableAbsoluteLayout }: SmartTextLayoutProps) {
  const renderedLines = useMemo(() => {
     if (lines) return lines.map(l => tokenize(l, undefined, styleOverrides?.words));
     if (text) return text.split('\n').map(l => tokenize(l, undefined, styleOverrides?.words));
     return [];
  }, [text, lines, styleOverrides]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Smart FitText behavior
  useEffect(() => {
    if (!containerRef.current || !textContainerRef.current) return;
    
    const container = containerRef.current;
    const textElem = textContainerRef.current;
    
    // Reset scale to correctly measure intrinsic size
    setScale(1);
    
    // We need to wait for DOM to update with scale=1
    requestAnimationFrame(() => {
       if (!container || !textElem) return;
       const computed = window.getComputedStyle(container);
       
       const contentWidth = container.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);
       const contentHeight = container.clientHeight - parseFloat(computed.paddingTop) - parseFloat(computed.paddingBottom);
       
       const maxTextWidth = textElem.scrollWidth;
       const maxTextHeight = textElem.scrollHeight;
       
       if (maxTextWidth === 0 || maxTextHeight === 0) return;
       
       const scaleWidth = contentWidth / maxTextWidth;
       const scaleHeight = contentHeight / maxTextHeight;
       
       // Choose the smaller scale to ensure it fits both horizontally and vertically
       let newScale = Math.min(scaleWidth, scaleHeight);
       
       // Prevent scaling up infinitely (cap at maybe 1.5x of the base size)
       newScale = Math.min(newScale, 1.5);
       
       setScale(newScale);
    });
  }, [text, source, type, styleOverrides?.layout]);

  const align = (styleOverrides?.global?.textAlign as string) || 'center';
  
  let alignItems = 'center';
  let origin = 'center center';
  
  if (align === 'left') {
     alignItems = 'flex-start';
     origin = 'center left';
  } else if (align === 'right') {
     alignItems = 'flex-end';
     origin = 'center right';
  } else if (align === 'justify') {
     alignItems = 'stretch';
     origin = 'center center';
  }

  const useAbsolute = !disableAbsoluteLayout;

  const layoutStyle: React.CSSProperties = useAbsolute ? {
    position: 'absolute',
    left: `${(styleOverrides?.layout?.x ?? 0.05) * 100}%`,
    top: `${(styleOverrides?.layout?.y ?? 0.05) * 100}%`,
    width: `${(styleOverrides?.layout?.width ?? 0.9) * 100}%`,
    height: `${(styleOverrides?.layout?.height ?? 0.9) * 100}%`,
    alignItems
  } : { alignItems };

  const posClass = useAbsolute ? 'absolute' : 'relative w-full h-full';

  const shouldRenderSeparateSource = source && useAbsolute && styleOverrides?.sourceLayout;

  const mainContent = (
    <div 
      ref={containerRef}
      className={`${posClass} flex flex-col justify-center overflow-hidden ${className.replace(/relative/g, '').replace(/w-full/g, '').replace(/h-full/g, '')}`}
      style={layoutStyle}
    >
      <div 
        ref={textContainerRef}
        className={`transition-transform duration-300 ease-out ${align === 'justify' ? 'w-full' : 'inline-block'} text-${align}`}
        style={{ 
          transform: `scale(${scale})`,
          transformOrigin: origin
        }}
      >
        <div 
          className={`font-display font-bold text-white uppercase ${align === 'justify' ? 'w-full block' : 'inline-block'} select-none`}
          style={{
            textAlign: align as any, // overrides
            fontSize: styleOverrides?.global?.fontSize || (type === 'scripture' ? '90px' : '110px'),
            lineHeight: 1.3,
            letterSpacing: type === 'scripture' ? 'normal' : '0.02em',
            textShadow: '0 8px 16px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5)',
            ...styleOverrides?.global
          }}
        >
          {renderedLines.map((lineTokens, lineIdx) => (
             <div key={`line-${lineIdx}`} className="min-h-[1em]">
               {lineTokens.map((token: Token) => {
                 const isClickable = (!!onWordClick || !!onWordMouseDown) && token.wordIndex !== undefined;
                 const isSelected = isClickable && selectedWordIndices?.includes(token.wordIndex as number);
                 
                 return (
                   <span 
                      key={token.id} 
                      onMouseDown={(e) => {
                        if (isClickable && onWordMouseDown) {
                          e.stopPropagation();
                          onWordMouseDown(token.wordIndex as number, e);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (isClickable && onWordMouseEnter) {
                          e.stopPropagation();
                          onWordMouseEnter(token.wordIndex as number, e);
                        }
                      }}
                      onMouseUp={(e) => {
                        if (isClickable && onWordMouseUp) {
                          e.stopPropagation();
                          onWordMouseUp(token.wordIndex as number, e);
                        }
                      }}
                      onClick={(e) => {
                        if (isClickable) {
                          e.stopPropagation();
                          if (onWordClick) onWordClick(token.wordIndex as number, e);
                        }
                      }}
                      className={`transition-colors duration-100 word-token ${isClickable ? 'cursor-pointer rounded hover:bg-white/10' : ''} ${isSelected ? 'bg-[#2563eb] text-white' : ''}`}
                      style={token.computedStyles}
                   >
                     {token.value}
                   </span>
                 );
               })}
             </div>
          ))}
        </div>
        {!shouldRenderSeparateSource && source && (
          <h2 
            className="mt-6 text-2xl font-heading font-bold text-amber-400 text-center tracking-wide"
            style={{
               textShadow: '0 4px 8px rgba(0,0,0,0.8)',
               ...styleOverrides?.global // Default to global text overrides if no separate box is there
            }}
          >
             {source}
          </h2>
        )}
      </div>
    </div>
  );

  if (!shouldRenderSeparateSource) return mainContent;

  return (
    <>
      {mainContent}
      <SmartTextLayout 
          text={source} 
          type="lyrics" 
          styleOverrides={{ 
            global: styleOverrides.sourceGlobal || { color: '#fbbf24', fontWeight: 'bold' }, 
            layout: styleOverrides.sourceLayout 
          }} 
          disableAbsoluteLayout={false}
          className={className}
      />
    </>
  );
}
