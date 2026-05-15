import React, { useState, useEffect } from 'react';
import useMeasure from 'react-use-measure';
import { Rnd } from 'react-rnd';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { FixedStage } from './FixedStage';
import { SmartTextLayout } from './SmartTextLayout';
import { SlideDefinition } from '../App';

export interface OutputStyleConfig {
  global?: React.CSSProperties & { '--font-scale'?: number };
  layout?: { x: number; y: number; width: number; height: number };
  sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
  sourceLayout?: { x: number; y: number; width: number; height: number };
  backgrounds?: any[];
}

interface OutputStyleEditorProps {
  initialStyle: OutputStyleConfig;
  type: 'lyrics' | 'scripture' | 'background';
  outputName: string;
  onSave: (newStyle: OutputStyleConfig) => void;
  onCancel: () => void;
}

export function OutputStyleEditor({ initialStyle, type, outputName, onSave, onCancel }: OutputStyleEditorProps) {
  const [style, setStyle] = useState<OutputStyleConfig>(initialStyle);
  const [activeElement, setActiveElement] = useState<'text' | 'source'>('text');
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
  
  const sampleText = type === 'lyrics' 
    ? "Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see"
    : "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.";

  const sampleSource = type === 'scripture' ? "John 3:16" : undefined;

  const updateStyle = (newStyles: React.CSSProperties | { layout: any }) => {
    setStyle(prev => {
      const next = { ...prev };
      if (activeElement === 'source' && type === 'scripture') {
         if ('layout' in newStyles) {
           next.sourceLayout = newStyles.layout;
         } else {
           next.sourceGlobal = { ...(next.sourceGlobal || {}), ...newStyles };
         }
      } else {
         if ('layout' in newStyles) {
           next.layout = newStyles.layout;
         } else {
           next.global = { ...(next.global || {}), ...newStyles };
         }
      }
      return next;
    });
  };

  const toggleStyle = (prop: keyof React.CSSProperties, valueOn: string | number, valueOff: string | number) => {
    const currentState = activeElement === 'source' ? (style.sourceGlobal?.[prop] || valueOff) : (style.global?.[prop] || valueOff);
    const newValue = currentState === valueOn ? valueOff : valueOn;
    updateStyle({ [prop]: newValue });
  };

  const getCurrentStyle = () => activeElement === 'source' ? (style.sourceGlobal || {}) : (style.global || {});

  return (
    <div className="fixed inset-0 z-[60] flex h-screen bg-black/90 backdrop-blur-md text-white">
       <div className="flex-1 flex flex-col h-full bg-[#030303] relative border-r border-white/5">
         <div className="h-16 px-6 border-b border-white/5 flex justify-between items-center bg-[#09090B] shadow-sm relative z-10">
            <div>
               <h2 className="text-lg font-bold tracking-tight">Edit {type === 'lyrics' ? 'Lyrics' : 'Bible'} Style</h2>
               <p className="text-xs text-neutral-500 font-medium mt-0.5">Editing override for: {outputName}</p>
            </div>
            <div className="flex gap-3">
               <button onClick={onCancel} className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-all">Cancel</button>
               <button onClick={() => onSave(style)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">Save Changes</button>
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center justify-center gap-8 custom-scrollbar relative">
            <div className="text-neutral-500 text-sm font-medium absolute top-8 left-1/2 -translate-x-1/2 bg-white/5 py-1.5 px-4 rounded-full backdrop-blur-sm border border-white/10">Drag to move, drag edges to resize workspace.</div>
            <FixedStage className="w-full max-w-5xl aspect-video rounded-xl bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-2 border-white/5 workspace-bg relative overflow-hidden">
             {(scale) => (
               <div className="w-full h-full relative workspace-bg" onClick={() => setActiveElement('text')}>
                 <Rnd
                   bounds="parent"
                   scale={scale}
                   z={activeElement === 'text' ? 20 : 10}
                   dragHandleClassName="drag-handle"
                   position={{
                     x: (style.layout?.x ?? 0.05) * 1920,
                     y: (style.layout?.y ?? 0.05) * 1080
                   }}
                   size={{
                     width: (style.layout?.width ?? 0.9) * 1920,
                     height: (style.layout?.height ?? 0.9) * 1080
                   }}
                   onDragStart={() => setActiveElement('text')}
                   onDragStop={(e, d) => {
                      updateStyle({ 
                        layout: {
                          ...style.layout,
                          x: d.x / 1920,
                          y: d.y / 1080,
                          width: style.layout?.width ?? 0.9,
                          height: style.layout?.height ?? 0.9
                        } 
                      });
                   }}
                   onResizeStart={() => setActiveElement('text')}
                   onResizeStop={(e, direction, refElem, delta, position) => {
                      updateStyle({ 
                        layout: {
                          x: position.x / 1920,
                          y: position.y / 1080,
                          width: refElem.offsetWidth / 1920,
                          height: refElem.offsetHeight / 1080
                        } 
                      });
                   }}
                   className={`border-[3px] transition-colors group bg-white/5 backdrop-blur-sm ${activeElement === 'text' ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] z-20' : 'border-white/20 hover:border-blue-500/50 z-10'}`}
                   onMouseDown={(e) => { e.stopPropagation(); setActiveElement('text'); }}
                   onClick={(e) => { e.stopPropagation(); setActiveElement('text'); }}
                 >
                    <div className="w-full h-full drag-handle cursor-move flex flex-col justify-center relative">
                        <div className="absolute -top-6 left-0 text-[10px] uppercase font-bold tracking-widest text-[#a1a1aa] pointer-events-none">Text Box</div>
                        <SmartTextLayout
                           className="w-full h-full pointer-events-none"
                           text={sampleText}
                           type={type}
                           source={undefined} // don't render source in the text component!
                           styleOverrides={{
                             global: style.global,
                             layout: { x: 0, y: 0, width: 1, height: 1 }
                           }}
                           disableAbsoluteLayout={false}
                        />
                    </div>
                 </Rnd>

                 {type === 'scripture' && sampleSource && (
                    <Rnd
                      bounds="parent"
                      scale={scale}
                      z={activeElement === 'source' ? 30 : 20}
                      dragHandleClassName="drag-handle-source"
                      position={{
                        x: (style.sourceLayout?.x ?? 0.05) * 1920,
                        y: (style.sourceLayout?.y ?? 0.8) * 1080
                      }}
                      size={{
                        width: (style.sourceLayout?.width ?? 0.9) * 1920,
                        height: (style.sourceLayout?.height ?? 0.15) * 1080
                      }}
                      onDragStart={(e) => { e.stopPropagation(); setActiveElement('source'); }}
                      onDragStop={(e, d) => {
                         setActiveElement('source');
                         updateStyle({ 
                           layout: {
                             ...style.sourceLayout,
                             x: d.x / 1920,
                             y: d.y / 1080,
                             width: style.sourceLayout?.width ?? 0.9,
                             height: style.sourceLayout?.height ?? 0.15
                           } 
                         });
                      }}
                      onResizeStart={(e) => { e.stopPropagation(); setActiveElement('source'); }}
                      onResizeStop={(e, direction, refElem, delta, position) => {
                         setActiveElement('source');
                         updateStyle({ 
                           layout: {
                             x: position.x / 1920,
                             y: position.y / 1080,
                             width: refElem.offsetWidth / 1920,
                             height: refElem.offsetHeight / 1080
                           } 
                         });
                      }}
                      className={`border-[3px] transition-colors group bg-white/5 backdrop-blur-sm ${activeElement === 'source' ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)] z-30' : 'border-white/20 hover:border-amber-500/50 z-20'}`}
                      onMouseDown={(e) => { e.stopPropagation(); setActiveElement('source'); }}
                      onClick={(e) => { e.stopPropagation(); setActiveElement('source'); }}
                    >
                       <div className="w-full h-full drag-handle-source cursor-move flex flex-col justify-center relative">
                           <div className="absolute -top-6 left-0 text-[10px] uppercase font-bold tracking-widest text-[#a1a1aa] pointer-events-none">Reference Box</div>
                           <SmartTextLayout
                              className="w-full h-full pointer-events-none"
                              text={sampleSource}
                              type="lyrics" // trick it to just render the text
                              styleOverrides={{
                                global: style.sourceGlobal || { color: '#fbbf24', fontWeight: 'bold' },
                                layout: { x: 0, y: 0, width: 1, height: 1 }
                              }}
                              disableAbsoluteLayout={false}
                           />
                       </div>
                    </Rnd>
                 )}
               </div>
             )}
            </FixedStage>
         </div>
       </div>

       {/* Right Panel: Formatting */}
       <div className="w-80 bg-[#09090B] h-full flex flex-col shrink-0 shadow-2xl relative z-20">
           <div className="h-16 px-6 border-b border-white/5 bg-[#09090B] flex items-center shrink-0">
              <h2 className="text-sm font-bold tracking-wide text-white">Format & Layout</h2>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Text Style */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Style</label>
                <div className="flex gap-2">
                  <button onClick={() => toggleStyle('fontWeight', 'bold', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.fontWeight === 'bold' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Bold size={16} />
                  </button>
                  <button onClick={() => toggleStyle('fontStyle', 'italic', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.fontStyle === 'italic' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Italic size={16} />
                  </button>
                  <button onClick={() => toggleStyle('textDecoration', 'underline', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textDecoration === 'underline' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <UnderlineIcon size={16} />
                  </button>
                  <button onClick={() => toggleStyle('textDecoration', 'line-through', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textDecoration === 'line-through' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Strikethrough size={16} />
                  </button>
                </div>
              </div>
              
              {/* Alignment */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Alignment</label>
                <div className="flex gap-2">
                  <button onClick={() => updateStyle({ textAlign: 'left' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textAlign === 'left' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignLeft size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'center' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textAlign === 'center' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignCenter size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'right' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textAlign === 'right' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignRight size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'justify' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${getCurrentStyle()?.textAlign === 'justify' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignJustify size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Letter Spacing</label>
                <input 
                  type="text" 
                  value={getCurrentStyle()?.letterSpacing || 'normal'}
                  onChange={(e) => updateStyle({ letterSpacing: e.target.value })}
                  placeholder="e.g. 0.05em or 2px"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Color</label>
                <div className="flex flex-wrap gap-3">
                  {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#FFD700', '#a3a3a3'].map(color => (
                     <button 
                       key={color}
                       onClick={() => updateStyle({ color })}
                       className="w-9 h-9 rounded-full shadow-inner hover:scale-110 transition-transform ring-2 ring-transparent focus:ring-blue-500 hover:ring-white/20"
                       style={{ backgroundColor: color }}
                     />
                  ))}
                  <div className="w-full flex items-center gap-3 mt-3 bg-white/5 p-2 rounded-lg border border-white/10">
                    <input 
                      type="color" 
                      className="w-10 h-10 rounded cursor-pointer border-none bg-transparent"
                      value={getCurrentStyle()?.color || '#ffffff'}
                      onChange={(e) => updateStyle({ color: e.target.value })}
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
                   value={getCurrentStyle()?.fontFamily || ''}
                   onChange={(e) => updateStyle({ fontFamily: e.target.value })}
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
              
              <div className="space-y-3">
                 <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font Size</label>
                 <div className="flex items-center gap-3">
                   <input 
                     type="number" 
                     min="10" max="400" 
                     value={parseInt(
                        (getCurrentStyle()?.fontSize as string) || (type === 'scripture' ? '90' : '110')
                     )}
                     className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                     onChange={(e) => updateStyle({ fontSize: `${e.target.value}px` })}
                   />
                   <span className="text-sm font-bold text-neutral-500">px</span>
                 </div>
                 <p className="text-xs text-neutral-500">Note: Dynamic sizing might adjust actual preview size</p>
              </div>
              
              <div className="pt-6 border-t border-white/5 space-y-3">
                <button 
                  onClick={() => setStyle({ layout: style.layout })}
                  className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-sm font-bold rounded-lg transition-all text-red-400"
                >
                   Clear Text Formatting
                </button>
                <button 
                  onClick={() => setStyle({ global: style.global })}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold rounded-lg transition-all text-neutral-300"
                >
                   Reset Layout Box
                </button>
              </div>
           </div>
       </div>
    </div>
  );
}
