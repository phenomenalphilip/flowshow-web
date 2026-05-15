import React, { useState, useEffect, useMemo } from 'react';
import useMeasure from 'react-use-measure';
import { Rnd } from 'react-rnd';
import { SlideDefinition } from '../App';
import { SmartTextLayout } from './SmartTextLayout';
import { FixedStage } from './FixedStage';
import { tokenize, Token } from '../lib/TokenEngine';
import { X, Copy, Trash, EyeOff, Eye, Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, Split } from 'lucide-react';

interface EditSongPageProps {
  song: {
    id: string;
    title: string;
    slides: SlideDefinition[];
  };
  initialSlideIndex?: number;
  onSave: (songId: string, updatedSlides: SlideDefinition[]) => void;
  onClose: () => void;
}

export function EditSongPage({ song, initialSlideIndex = 0, onSave, onClose }: EditSongPageProps) {
  const [slides, setSlides] = useState<SlideDefinition[]>(song.slides);
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  
  useEffect(() => {
     if ('queryLocalFonts' in window) {
        // @ts-ignore
        window.queryLocalFonts().then(fonts => {
           const uniqueFonts = Array.from(new Set(fonts.map((f: any) => f.family))) as string[];
           setLocalFonts(uniqueFonts.sort());
        }).catch(() => {});
     }
  }, []);
  
  const [selectedSlideIndices, setSelectedSlideIndices] = useState<number[]>([initialSlideIndex]);
  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([]);
  const isDraggingWordRef = React.useRef(false);
  const dragStartWordIdxRef = React.useRef<number | null>(null);
  const isDraggingSlideRef = React.useRef(false);
  const dragStartSlideIdxRef = React.useRef<number | null>(null);
  const [previewRef, bounds] = useMeasure();
  
  // Ref for the left panel container to handle Ctrl+A
  const leftPanelRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if focus is in a text area or input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
         return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedSlideIndices(slides.map((_, i) => i));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        onSave(song.id, slides);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Song saved locally.' }));
      }
    };

    const handleMouseUp = () => {
      isDraggingWordRef.current = false;
      isDraggingSlideRef.current = false;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [slides, song.id, onSave]);
  
  const activeSlideIndex = selectedSlideIndices[0] ?? 0;
  const activeSlide = slides[activeSlideIndex] as SlideDefinition | undefined;

  const updateSlideStyle = (newStyles: React.CSSProperties | { layout: any }) => {
    setSlides(prev => {
      const next = [...prev];
      selectedSlideIndices.forEach(slideIdx => {
        const slide = { ...next[slideIdx] };
        if (!slide.styleOverrides) {
           slide.styleOverrides = {};
        } else {
           slide.styleOverrides = { ...slide.styleOverrides };
        }
        
        if ('layout' in newStyles) {
           slide.styleOverrides.layout = newStyles.layout;
        } else {
            if (selectedWordIndices.length > 0) {
               // Apply to specific words
               slide.styleOverrides.words = { ...(slide.styleOverrides.words || {}) };
               selectedWordIndices.forEach(wordIdx => {
                 slide.styleOverrides!.words![wordIdx] = {
                   ...slide.styleOverrides!.words![wordIdx],
                   ...newStyles
                 };
               });
            } else {
               // Apply globally to the slide
               slide.styleOverrides.global = {
                 ...(slide.styleOverrides.global || {}),
                 ...newStyles
               };
            }
        }
        next[slideIdx] = slide;
      });
      return next;
    });
  };
  
  const toggleStyle = (prop: keyof React.CSSProperties, valueOn: string | number, valueOff: string | number) => {
     // Determine the current state based on the first selected slide/word
     if (!activeSlide) return;
     let currentState = valueOff;
     
     if (selectedWordIndices.length > 0) {
        const wordIdx = selectedWordIndices[0];
        const val = activeSlide.styleOverrides?.words?.[wordIdx]?.[prop];
        if (val === valueOn) currentState = valueOn;
        // else off
     } else {
        const val = activeSlide.styleOverrides?.global?.[prop];
        if (val === valueOn) currentState = valueOn;
     }

     const newValue = currentState === valueOn ? valueOff : valueOn;
     updateSlideStyle({ [prop]: newValue });
  };

  const handleDuplicate = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      const copy = { ...next[idx], id: `slide-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` };
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleSplit = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      const slideToSplit = next[idx];
      const lines = slideToSplit.text.split('\n');
      if (lines.length <= 1) return prev;
      
      const mid = Math.ceil(lines.length / 2);
      const firstHalf = lines.slice(0, mid).join('\n');
      const secondHalf = lines.slice(mid).join('\n');
      
      const slide1 = { ...slideToSplit, text: firstHalf };
      const slide2 = { ...slideToSplit, text: secondHalf, id: `slide-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` };
      
      next[idx] = slide1;
      next.splice(idx + 1, 0, slide2);
      return next;
    });
  };

  const handleDelete = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      if (next.length > 1) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], text: '' };
      }
      return next;
    });
    if (selectedSlideIndices.includes(idx)) {
       setSelectedSlideIndices([Math.max(0, idx - 1)]);
    }
  };

  const toggleDisable = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], disabled: !next[idx].disabled };
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex h-screen bg-black/90 backdrop-blur-md text-white">
      {/* Left Panel: Slide List */}
      <div 
         ref={leftPanelRef}
         tabIndex={0}
         className="w-72 border-r border-white/5 flex flex-col h-full bg-[#030303] shrink-0 outline-none shadow-xl z-20"
      >
        <div className="h-16 px-6 border-b border-white/5 flex justify-between items-center bg-[#09090B]">
           <h2 className="text-sm font-bold tracking-wide text-white">Slides</h2>
           <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Ctrl+A to select all</span>
        </div>
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedSlideIndices([]);
            }
          }}
        >
           {slides.map((slide, idx) => {
              const isSelected = selectedSlideIndices.includes(idx);
              return (
                 <div 
                   key={slide.id}
                   onMouseDown={(e) => {
                      e.stopPropagation();
                      isDraggingSlideRef.current = true;
                      dragStartSlideIdxRef.current = idx;
                      if (e.ctrlKey || e.metaKey) {
                         setSelectedSlideIndices(prev => 
                           prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                         );
                      } else if (e.shiftKey && selectedSlideIndices.length > 0) {
                         const start = Math.min(selectedSlideIndices[0], idx);
                         const end = Math.max(selectedSlideIndices[0], idx);
                         const newSelection = [];
                         for (let i = start; i <= end; i++) newSelection.push(i);
                         setSelectedSlideIndices(newSelection);
                      } else {
                         setSelectedSlideIndices([idx]);
                         setSelectedWordIndices([]);
                      }
                   }}
                   onMouseEnter={(e) => {
                      if (isDraggingSlideRef.current && dragStartSlideIdxRef.current !== null) {
                         const start = Math.min(dragStartSlideIdxRef.current, idx);
                         const end = Math.max(dragStartSlideIdxRef.current, idx);
                         const newSelection = [];
                         for (let i = start; i <= end; i++) newSelection.push(i);
                         setSelectedSlideIndices(newSelection);
                      }
                   }}
                   className={`
                     p-4 rounded-xl cursor-pointer border transition-all group relative select-none
                     ${isSelected ? 'bg-blue-600/20 border-blue-500/50 shadow-inner' : 'bg-[#121214] border-white/5 hover:border-white/20 hover:bg-white/5 shadow-sm'}
                     ${slide.disabled ? 'opacity-40 grayscale' : 'opacity-100'}
                   `}
                 >
                   <div className="absolute top-0 right-0 p-2 opacity-100 mix-blend-difference pointer-events-none">
                     <span className="text-[10px] font-mono text-neutral-500">{idx + 1}</span>
                   </div>
                   <div className="text-sm font-medium line-clamp-3 whitespace-pre-wrap leading-relaxed text-neutral-300 pointer-events-none mt-1">
                     {slide.text || <span className="italic text-neutral-600">Empty Slide</span>}
                   </div>
                   
                   {/* Context Actions */}
                   <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center bg-black/90 backdrop-blur shadow-lg rounded-md border border-white/10 overflow-hidden transition-opacity">
                     <button onClick={(e) => { e.stopPropagation(); toggleDisable(idx); }} className="p-1.5 hover:bg-white/20 text-neutral-300 transition-colors" title="Toggle Disable">
                        {slide.disabled ? <Eye size={12} /> : <EyeOff size={12} />}
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); handleSplit(idx); }} className="p-1.5 hover:bg-white/20 text-neutral-300 transition-colors" title="Split Slide">
                        <Split size={12} />
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); handleDuplicate(idx); }} className="p-1.5 hover:bg-white/20 text-neutral-300 transition-colors" title="Duplicate">
                        <Copy size={12} />
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); handleDelete(idx); }} className="p-1.5 hover:bg-red-500/80 text-red-400 hover:text-white transition-colors" title="Delete">
                        <Trash size={12} />
                     </button>
                   </div>
                 </div>
              );
           })}
        </div>
      </div>
      
      {/* Middle Panel: active slide text editor + live preview */}
      <div className="flex-1 flex flex-col h-full bg-[#030303] relative border-r border-white/5">
         <div className="h-16 px-6 border-b border-white/5 flex justify-between items-center bg-[#09090B] shadow-sm relative z-10">
            <div>
               <h2 className="text-lg font-bold tracking-tight">{song.title}</h2>
               <p className="text-xs text-neutral-500 font-medium mt-0.5">Song Editor</p>
            </div>
            <div className="flex gap-3">
               <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-all">Cancel</button>
               <button onClick={() => { onSave(song.id, slides); onClose(); }} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">Save Changes</button>
            </div>
         </div>
         
         {activeSlide ? (
           <div 
             className="flex-1 overflow-y-auto p-12 flex flex-col items-center gap-8 custom-scrollbar relative"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget || (e.target as Element).closest('.workspace-bg')) {
                 setSelectedWordIndices([]);
               }
             }}
           >
              <div className="text-neutral-500 text-sm font-medium absolute top-8 left-1/2 -translate-x-1/2 bg-white/5 py-1.5 px-4 rounded-full backdrop-blur-sm border border-white/10">Drag to move, drag edges to resize workspace.</div>
              <FixedStage className="w-full max-w-5xl aspect-video rounded-xl bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-2 border-white/5 workspace-bg relative overflow-hidden">
               {(scale) => (
                 <div
                   className="w-full h-full relative workspace-bg"
                   onMouseDown={(e) => {
                      if (e.target === e.currentTarget) {
                        setSelectedWordIndices([]);
                      }
                   }}
                 >
                   <Rnd
                     bounds="parent"
                     scale={scale}
                     cancel=".word-token"
                     dragHandleClassName="drag-handle"
                     position={{
                       x: (activeSlide.styleOverrides?.layout?.x ?? 0.05) * 1920,
                       y: (activeSlide.styleOverrides?.layout?.y ?? 0.05) * 1080
                     }}
                     size={{
                       width: (activeSlide.styleOverrides?.layout?.width ?? 0.9) * 1920,
                       height: (activeSlide.styleOverrides?.layout?.height ?? 0.9) * 1080
                     }}
                     onDragStop={(e, d) => {
                        updateSlideStyle({ 
                          layout: {
                            ...activeSlide.styleOverrides?.layout,
                            x: d.x / 1920,
                            y: d.y / 1080,
                            width: activeSlide.styleOverrides?.layout?.width ?? 0.9,
                            height: activeSlide.styleOverrides?.layout?.height ?? 0.9
                          } 
                        });
                     }}
                     onResizeStop={(e, direction, refElem, delta, position) => {
                        updateSlideStyle({ 
                          layout: {
                            x: position.x / 1920,
                            y: position.y / 1080,
                            width: refElem.offsetWidth / 1920,
                            height: refElem.offsetHeight / 1080
                          } 
                        });
                     }}
                     className="border-[3px] border-blue-500/50 hover:border-blue-500 transition-colors group shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-white/5 backdrop-blur-sm"
                   >
                      <div className={`w-full h-full drag-handle cursor-move flex flex-col justify-center`}>
                          <SmartTextLayout
                             className="w-full h-full"
                             text={activeSlide.text}
                             source={activeSlide.source}
                             type={activeSlide.type}
                             styleOverrides={activeSlide.styleOverrides}
                             disableAbsoluteLayout={true}
                             selectedWordIndices={selectedWordIndices}
                             onWordMouseDown={(idx, e) => {
                                isDraggingWordRef.current = true;
                                dragStartWordIdxRef.current = idx;
                                if (e.ctrlKey || e.metaKey) {
                                   setSelectedWordIndices(prev => 
                                     prev.includes(idx) ? prev.filter(w => w !== idx) : [...prev, idx]
                                   );
                                } else {
                                   setSelectedWordIndices([idx]);
                                }
                             }}
                             onWordMouseEnter={(idx, e) => {
                                if (isDraggingWordRef.current && dragStartWordIdxRef.current !== null) {
                                   const start = Math.min(dragStartWordIdxRef.current, idx);
                                   const end = Math.max(dragStartWordIdxRef.current, idx);
                                   const newSelection = [];
                                   for (let i = start; i <= end; i++) newSelection.push(i);
                                   setSelectedWordIndices(newSelection);
                                }
                             }}
                          />
                      </div>
                   </Rnd>
                  
                 </div>
               )}
              </FixedStage>
           </div>
         ) : (
           <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
             <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <p className="text-lg font-bold text-neutral-400">No slide selected</p>
                <p className="text-sm mt-2 text-neutral-600">Select a slide from the left panel to edit</p>
             </div>
           </div>
         )}
      </div>
      
      {/* Right Panel: Formatting */}
      <div className="w-80 bg-[#09090B] h-full flex flex-col shrink-0 shadow-2xl relative z-20">
          <div className="h-16 px-6 border-b border-white/5 bg-[#09090B] flex flex-col justify-center shrink-0">
             <h2 className="text-sm font-bold tracking-wide text-white">Format & Layout</h2>
             <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mt-0.5">
               {selectedWordIndices.length > 0 
                 ? `${selectedWordIndices.length} word(s) selected` 
                 : selectedSlideIndices.length > 1 
                   ? `${selectedSlideIndices.length} slides selected` 
                   : 'Entire slide selected'}
             </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
             {/* Edit Text */}
             {selectedSlideIndices.length === 1 && activeSlide && (
               <div className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Reference / Source</span>
                      <span className="text-neutral-600 font-mono text-[9px]">OPTIONAL</span>
                   </label>
                   <input 
                     type="text"
                     className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                     value={activeSlide.source || ''}
                     onChange={(e) => {
                         setSlides(prev => {
                            const next = [...prev];
                            next[activeSlideIndex] = { ...next[activeSlideIndex], source: e.target.value };
                            return next;
                         });
                     }}
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Slide Text</span>
                      <span className="text-neutral-600 font-mono text-[9px]">RAW TEXT</span>
                   </label>
                   <textarea 
                     className="w-full h-32 bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium custom-scrollbar resize-y leading-relaxed"
                     value={activeSlide.text}
                     onChange={(e) => {
                         setSlides(prev => {
                            const next = [...prev];
                            next[activeSlideIndex] = { ...next[activeSlideIndex], text: e.target.value };
                            return next;
                         });
                     }}
                   />
                 </div>
               </div>
             )}

             {/* Text Style */}
             <div className="space-y-3">
               <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Style</label>
               <div className="flex gap-2">
                 <button onClick={() => toggleStyle('fontWeight', 'bold', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.fontWeight === 'bold' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <Bold size={16} />
                 </button>
                 <button onClick={() => toggleStyle('fontStyle', 'italic', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.fontStyle === 'italic' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <Italic size={16} />
                 </button>
                 <button onClick={() => toggleStyle('textDecoration', 'underline', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textDecoration === 'underline' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <UnderlineIcon size={16} />
                 </button>
                 <button onClick={() => toggleStyle('textDecoration', 'line-through', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textDecoration === 'line-through' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <Strikethrough size={16} />
                 </button>
               </div>
             </div>
             
             {/* Alignment */}
             <div className="space-y-3">
               <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Alignment</label>
               <div className="flex gap-2">
                 <button onClick={() => updateSlideStyle({ textAlign: 'left' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textAlign === 'left' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <AlignLeft size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'center' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textAlign === 'center' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <AlignCenter size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'right' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textAlign === 'right' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <AlignRight size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'justify' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${activeSlide?.styleOverrides?.global?.textAlign === 'justify' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                    <AlignJustify size={16} />
                 </button>
               </div>
             </div>
             
             {/* Color */}
             <div className="space-y-3">
               <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Color</label>
               <div className="flex flex-wrap gap-3">
                 {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#FFD700', '#a3a3a3'].map(color => (
                    <button 
                      key={color}
                      onClick={() => updateSlideStyle({ color })}
                      className="w-9 h-9 rounded-full shadow-inner hover:scale-110 transition-transform ring-2 ring-transparent focus:ring-blue-500 hover:ring-white/20"
                      style={{ backgroundColor: color }}
                    />
                 ))}
                 <div className="w-full flex items-center gap-3 mt-3 bg-white/5 p-2 rounded-lg border border-white/10">
                   <input 
                     type="color" 
                     className="w-10 h-10 rounded cursor-pointer border-none bg-transparent"
                     onChange={(e) => updateSlideStyle({ color: e.target.value })}
                   />
                   <span className="text-sm font-medium text-neutral-300 flex-1">Custom Color</span>
                 </div>
               </div>
             </div>
             
             {/* Font Family */}
             <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font Family</label>
                <select 
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                  onChange={(e) => updateSlideStyle({ fontFamily: e.target.value })}
                  value={
                     (selectedWordIndices.length > 0 
                        ? activeSlide?.styleOverrides?.words?.[selectedWordIndices[0]]?.fontFamily 
                        : activeSlide?.styleOverrides?.global?.fontFamily
                     ) as string || ''
                  }
                >
                   <option value="" className="bg-black text-white">Default (From Theme)</option>
                   <option value="Inter, sans-serif" className="bg-black text-white">Inter</option>
                   <option value="Space Grotesk, sans-serif" className="bg-black text-white">Space Grotesk</option>
                   <option value="Outfit, sans-serif" className="bg-black text-white">Outfit</option>
                   <option value="Playfair Display, serif" className="bg-black text-white">Playfair Display</option>
                   <option value="JetBrains Mono, monospace" className="bg-black text-white">JetBrains Mono</option>
                   {localFonts.length > 0 && <optgroup label="Local Fonts" className="bg-[#111]">
                      {localFonts.map(font => (
                         <option key={font} value={`"${font}", sans-serif`} className="bg-black text-white">{font}</option>
                      ))}
                   </optgroup>}
                </select>
             </div>

             {/* Letter Spacing */}
             <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Letter Spacing</label>
                <input 
                  type="text" 
                  placeholder="e.g. 0.05em or 2px"
                  value={
                    (selectedWordIndices.length > 0 
                      ? activeSlide?.styleOverrides?.words?.[selectedWordIndices[0]]?.letterSpacing 
                      : activeSlide?.styleOverrides?.global?.letterSpacing
                    ) as string || ''
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                  onChange={(e) => updateSlideStyle({ letterSpacing: e.target.value })}
                />
             </div>
             
             {/* Size Adjustments */}
             <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font Size</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    min="10" max="400" 
                    value={parseInt(
                      (selectedWordIndices.length > 0 
                        ? activeSlide?.styleOverrides?.words?.[selectedWordIndices[0]]?.fontSize 
                        : activeSlide?.styleOverrides?.global?.fontSize
                      ) as string || (activeSlide?.type === 'scripture' ? '90' : '110')
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                    onChange={(e) => updateSlideStyle({ fontSize: `${e.target.value}px` })}
                  />
                  <span className="text-sm font-bold text-neutral-500">px</span>
                </div>
             </div>
             
             <div className="pt-6 border-t border-white/5 space-y-3">
               <button 
                 onClick={() => {
                   // Clear selected styles
                   setSlides(prev => {
                     const next = [...prev];
                     selectedSlideIndices.forEach(slideIdx => {
                        const slide = { ...next[slideIdx] };
                        if (slide.styleOverrides) {
                           if (selectedWordIndices.length > 0) {
                              selectedWordIndices.forEach(w => {
                                 if (slide.styleOverrides!.words) delete slide.styleOverrides!.words[w];
                              });
                           } else {
                              slide.styleOverrides.global = {};
                           }
                        }
                        next[slideIdx] = slide;
                     });
                     return next;
                   });
                 }}
                 className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-sm font-bold rounded-lg transition-all text-red-400"
               >
                  Clear Text Formatting
               </button>
             </div>
          </div>
      </div>
    </div>
  );
}
