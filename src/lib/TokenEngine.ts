import React from 'react';

export type TokenType = 'word' | 'whitespace' | 'punctuation' | 'bracketed';

export interface Token {
  id: string;
  type: TokenType;
  value: string;
  computedStyles: React.CSSProperties;
  wordIndex?: number;
}

export interface StyleRule {
  match: RegExp | string;
  styles: React.CSSProperties;
}

const DEFAULT_RULES: StyleRule[] = [
  {
    match: /\b(Jesus|God|Lord|Christ|Holy Spirit|Yahweh|Spirit|Father|Savior)\b/i,
    styles: { 
      color: '#FFD700', 
      textShadow: '0 0 20px rgba(255, 215, 0, 0.4), 0 4px 6px rgba(0,0,0,0.8)'
    }
  },
  {
    match: /^\(.*\)$/,
    styles: { fontStyle: 'italic', opacity: 0.85, fontWeight: 400 }
  },
  {
    match: /^\[.*\]$/,
    styles: { 
      fontFamily: 'Inter, sans-serif',
      fontSize: '0.5em', 
      textTransform: 'uppercase', 
      letterSpacing: '0.1em', 
      color: '#A3A3A3',
      display: 'block',
      marginBottom: '0.5em'
    }
  }
];

export function tokenize(
  text: string, 
  rules: StyleRule[] = DEFAULT_RULES,
  wordOverrides?: { [index: number]: React.CSSProperties }
): Token[] {
  const regex = /(\([^)]+\)|\[[^\]]+\]|\s+|[.,;!?()[\]{}'"]+)/g;
  const parts = text.split(regex).filter(Boolean);
  
  let wordIndex = 0;

  return parts.map((part, index) => {
    let type: TokenType = 'word';
    if (/^\s+$/.test(part)) type = 'whitespace';
    else if (/^[.,;!?()[\]{}'"]+$/.test(part)) type = 'punctuation';
    else if (/^\(.*\)$/.test(part) || /^\[.*\]$/.test(part)) type = 'bracketed';

    let computedStyles: React.CSSProperties = {};
    const currentWordIndex = (type === 'word' || type === 'bracketed') ? wordIndex++ : -1;

    if (type === 'word' || type === 'bracketed') {
       for (const rule of rules) {
         if (typeof rule.match === 'string') {
           if (part.toLowerCase() === rule.match.toLowerCase()) {
             computedStyles = { ...computedStyles, ...rule.styles };
           }
         } else if (rule.match instanceof RegExp) {
           rule.match.lastIndex = 0; // reset
           if (rule.match.test(part)) {
             computedStyles = { ...computedStyles, ...rule.styles };
           }
         }
       }
       
       if (wordOverrides && wordOverrides[currentWordIndex]) {
         computedStyles = { ...computedStyles, ...wordOverrides[currentWordIndex] };
       }
    }

    return {
      id: `token-${index}`,
      type,
      value: part,
      computedStyles,
      wordIndex: currentWordIndex
    };
  });
}
