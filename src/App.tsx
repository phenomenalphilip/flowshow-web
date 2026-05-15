import { HashRouter, Routes, Route, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, 
  Plus, Search, X, Layers, Play,
  MonitorOff, EyeOff, FileText,
  Activity, Upload, Edit2, Copy, Trash, Split,
  Pause, Volume2, VolumeX, Save, ExternalLink as LaunchIcon, Clock, Lock, PanelLeft, PanelLeftClose, ChevronRight, CheckCircle2
} from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      getScreens: () => Promise<any[]>;
      openProjector: (outputId: string, displayLabel: string) => Promise<void>;
      closeProjectors: () => Promise<void>;
    };
  }
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

import { MediaLibrary } from './components/MediaLibrary';
import { AudioModule } from './components/AudioModule';
import { AddSongModal } from './components/AddSongModal';
import { EditSongPage } from './components/EditSongPage';
import { get, set } from 'idb-keyval';
import { SmartTextLayout } from './components/SmartTextLayout';
import { FixedStage } from './components/FixedStage';
import { BibleVersion, getBibleList, getBible, saveBible, deleteBible, initDatabase } from './lib/bibleDb';
import { parseBibleXml } from './lib/xmlParser';
import { OutputStyleEditor, OutputStyleConfig } from './components/OutputStyleEditor';

export type SlideType = 'lyrics' | 'scripture' | 'blank' | 'media';

export type MediaElement = {
  id: string;
  type: 'image' | 'video' | 'color';
  url?: string;
  color?: string;
  fileName?: string;
  opacity: number;
  layout: { x: number; y: number; width: number; height: number };
};

export type SlideDefinition = {
  id: string;
  text: string;
  source?: string;
  backgroundUrl?: string;
  type: SlideType;
  disabled?: boolean;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
};

export interface OutputSettings {
  id: string;
  name: string;
  enabled: boolean;
  backgrounds: MediaElement[];
  lyricsStyleEnabled: boolean;
  lyricsStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  bibleStyleEnabled: boolean;
  bibleStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number }; sourceGlobal?: React.CSSProperties & { '--font-scale'?: number }; sourceLayout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  displayId?: string;
}

export interface GlobalSettings {
  outputs: OutputSettings[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  outputs: [
    {
      id: 'main',
      name: 'Main Output',
      enabled: true,
      backgrounds: [],
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    },
    {
      id: 'livestream',
      name: 'Livestream',
      enabled: false,
      backgrounds: [],
      lyricsStyleEnabled: true,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal', textShadow: '2px 2px 4px #000000' },
      bibleStyleEnabled: true,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal', textShadow: '2px 2px 4px #000000' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal', textShadow: '2px 2px 4px #000000' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    },
    {
      id: 'stage',
      name: 'Stage Display',
      enabled: false,
      backgrounds: [{ id: 'stage-bg-default', type: 'color', color: '#000000', opacity: 100, layout: { x: 0, y: 0, width: 1, height: 1 } }],
      lyricsStyleEnabled: true,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: true,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    }
  ]
};

export type PresentState = {
  slide: SlideDefinition | null;
  globalBackground: { url: string; type: 'image' | 'video', fileName?: string } | null;
  clearText: boolean;
  clearedOutputs?: Record<string, boolean>; 
  lockedOutputs?: Record<string, boolean>; 
  frozenStates?: Record<string, { slide: SlideDefinition | null; bgs: MediaElement[]; clearText: boolean }>; 
  videoInitState?: {
    time: number;
    muted: boolean;
    playing: boolean;
  };
  settings?: GlobalSettings;
  isPresenting?: boolean;
};

const CHANNEL_NAME = 'flowshow_presence_channel';

const applyGlobalStyles = (slide: SlideDefinition | null, outputConfig?: OutputSettings): SlideDefinition['styleOverrides'] => {
  if (!slide) return undefined;
  if (!outputConfig) return slide.styleOverrides;

  let mergedStyle = { ...slide.styleOverrides };

  if (slide.type === 'lyrics' && outputConfig.lyricsStyleEnabled) {
     mergedStyle = {
       ...mergedStyle,
       global: { ...mergedStyle.global, ...(outputConfig.lyricsStyle as any)?.global || outputConfig.lyricsStyle },
       layout: (outputConfig.lyricsStyle as any)?.layout || mergedStyle.layout,
     };
  }
  if (slide.type === 'scripture' && outputConfig.bibleStyleEnabled) {
     const bibleStyle = outputConfig.bibleStyle as any;
     mergedStyle = {
       ...mergedStyle,
       global: { ...mergedStyle.global, ...bibleStyle?.global || bibleStyle },
       layout: bibleStyle?.layout || mergedStyle.layout,
       sourceGlobal: { ...mergedStyle.sourceGlobal, ...bibleStyle?.sourceGlobal },
       sourceLayout: bibleStyle?.sourceLayout || mergedStyle.sourceLayout
     };
  }
  return mergedStyle;
};

const StyleConfigurator = ({ title, enabled, onToggle, onEdit }: any) => {
  return (
    <div className="bg-[#121214] border border-white/5 p-6 rounded-xl mb-4 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer group">
           <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded cursor-pointer" />
           <span className="font-bold uppercase tracking-wider text-sm text-neutral-300 group-hover:text-white transition-colors">{title}</span>
        </label>
        <button 
           disabled={!enabled}
           onClick={onEdit} 
           className="bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/5"
        >
           Edit Layout & Format
        </button>
      </div>
    </div>
  );
};

function SettingsModal({ isOpen, onClose, settings, onSave, detectedScreens, primaryScreenLabel }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  const [activeOutputId, setActiveOutputId] = useState('main');
  const [local, setLocal] = useState<GlobalSettings>(settings);
  const [editingStyleType, setEditingStyleType] = useState<'lyrics' | 'scripture' | 'background' | null>(null);

  useEffect(() => { setLocal(settings); }, [settings, isOpen]);
  useEffect(() => {
     const current = local.outputs.find(o => o.id === activeOutputId);
     if (!current || !current.enabled) setActiveOutputId('main');
  }, [local.outputs, activeOutputId]);

  // Handle Ctrl+S inside Settings Modal
  useEffect(() => {
     if (!isOpen) return;
     const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
           e.preventDefault();
           onSave(local);
           window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Settings saved locally.' }));
        }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [local, isOpen, onSave]);

  if (!isOpen) return null;

  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    const nextOutputs = local.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o);
    const next = { ...local, outputs: nextOutputs };
    setLocal(next);
    onSave(next);
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId)!;

  return (
    <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-200">
       <div className="bg-[#09090B] border border-white/10 rounded-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden shadow-2xl">
          <div className="w-56 bg-[#030303] border-r border-white/5 p-6 flex flex-col gap-2 shrink-0">
             <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-6 px-2">Global Settings</div>
             <button onClick={() => setActiveTab('outputs')} className={`text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'outputs' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>Outputs</button>
             <button onClick={() => setActiveTab('style')} className={`text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'style' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>Style & Theme</button>
             <button onClick={() => setActiveTab('help')} className={`text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'help' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>Help</button>
          </div>
          <div className="flex-1 flex flex-col min-w-0 bg-[#09090B]">
             <div className="flex-1 overflow-y-auto p-8 lg:p-10 custom-scrollbar">
               {activeTab === 'outputs' && (
                  <div className="space-y-8 max-w-2xl">
                     <div>
                       <h2 className="text-3xl font-bold text-white tracking-tight">Active Screens</h2>
                       <p className="text-sm text-neutral-400 mt-2">Enable additional projector screens like Livestream or Stage Display.</p>
                     </div>
                     <div className="space-y-4">
                        <div className="mb-4 text-sm text-green-400 font-medium">
                           {detectedScreens.length > 0 ? `${detectedScreens.length} display(s) detected dynamically` : 'Scanning for displays...'}
                        </div>
                        {local.outputs.map(out => (
                           <div key={out.id} className="bg-[#121214] border border-white/5 p-6 rounded-xl flex flex-col gap-4 shadow-sm">
                              <div className="flex items-center justify-between">
                                <div>
                                   <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-200">{out.name}</h3>
                                   <p className="text-sm text-neutral-500 mt-1">{out.id === 'main' ? 'The primary presentation screen.' : `Secondary output for ${out.name.toLowerCase()}.`}</p>
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                   <span className={`text-sm font-semibold transition-colors ${out.enabled ? 'text-blue-400' : 'text-neutral-500 group-hover:text-neutral-400'}`}>{out.enabled ? 'Enabled' : 'Disabled'}</span>
                                   <input type="checkbox" checked={out.enabled} disabled={out.id === 'main'} onChange={(e) => updateOutput(out.id, { enabled: e.target.checked })} className="w-5 h-5 accent-blue-500 cursor-pointer rounded bg-white/10" />
                                </label>
                              </div>
                              {out.enabled && (
                                <div className="border-t border-white/5 pt-4 flex flex-col gap-2">
                                   <label className="text-xs uppercase font-bold tracking-widest text-neutral-500">Target Display</label>
                                   <select 
                                      value={out.displayId || ''} 
                                      onChange={(e) => updateOutput(out.id, { displayId: e.target.value })}
                                      className="bg-[#09090B] border border-white/10 rounded-lg text-sm px-3 py-2 text-white outline-none focus:border-blue-500 max-w-sm"
                                   >
                                      <option value="" className="bg-[#09090B] text-neutral-400">-- No Display Selected --</option>
                                      {detectedScreens.map((s, i) => {
                                         const isPrimary = s.label === primaryScreenLabel;
                                         const isAssigned = local.outputs.some(otherOut => 
                                            otherOut.id !== out.id && 
                                            otherOut.enabled && 
                                            otherOut.displayId === s.label
                                         );
                                         const isDisabled = isPrimary || isAssigned;
                                         
                                         let descriptor = '';
                                         if (isPrimary) descriptor = ' (Primary Monitor - Locked)';
                                         else if (isAssigned) descriptor = ' (Already in Use)';

                                         return (
                                            <option key={s.label || i} value={s.label} disabled={isDisabled} className="bg-[#09090B] text-white">
                                               {s.label} {descriptor}
                                            </option>
                                         );
                                      })}
                                   </select>
                                   {!out.displayId && <p className="text-[10px] text-orange-400">Warning: You must select a display to go LIVE to {out.name}.</p>}
                                </div>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               )}
               {activeTab === 'help' && (
                  <div>
                     <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Help & Documentation</h2>
                     <p className="text-neutral-400 leading-relaxed text-sm">Documentation and shortcut keys are coming soon.</p>
                  </div>
               )}
               {activeTab === 'style' && (
                  <div className="space-y-8 max-w-3xl">
                     <div className="flex items-center justify-between">
                       <div>
                         <h2 className="text-3xl font-bold text-white tracking-tight">Style Profiles</h2>
                         <p className="text-sm text-neutral-400 mt-2">Manage backgrounds and typography overrides per output screen.</p>
                       </div>
                       <div className="bg-[#030303] border border-white/5 p-1.5 rounded-xl flex gap-1 shadow-inner">
                          {local.outputs.filter(o => o.enabled).map(out => (
                             <button key={out.id} onClick={() => setActiveOutputId(out.id)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeOutputId === out.id ? 'bg-white/10 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}>{out.name}</button>
                          ))}
                       </div>
                     </div>
                     <div className="h-px bg-white/5 w-full my-8"></div>
                     <h3 className="text-xl font-bold text-blue-400 mb-6">{activeOutput?.name || 'Output'} Configuration</h3>

                     {activeOutput && (
                        <>
                           <div className="bg-[#121214] border border-white/5 p-6 rounded-xl mb-6 shadow-sm">
                              <div className="flex items-center justify-between">
                                 <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-200 mb-1">Background Display</h3>
                                    <p className="text-sm text-neutral-500">
                                      {activeOutput.backgrounds?.length > 0 
                                         ? `${activeOutput.backgrounds.length} active media layer(s) configured.` 
                                         : `Currently set to Transparent (No Background).`}
                                    </p>
                                 </div>
                                 <div className="flex items-center gap-3">
                                    {activeOutput.backgrounds?.length > 0 && (
                                       <button 
                                         onClick={() => updateOutput(activeOutputId, { backgrounds: [] })} 
                                         className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-lg text-sm font-bold transition-all border border-red-500/20"
                                       >
                                         Set Transparent
                                       </button>
                                    )}
                                    <button 
                                      onClick={() => setEditingStyleType('background')} 
                                      className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 px-5 py-2.5 rounded-lg text-sm font-bold border border-emerald-500/30 transition-all flex items-center gap-2"
                                    >
                                      <Layers size={16} /> {activeOutput.backgrounds?.length > 0 ? 'Edit Layout' : 'Add Background'}
                                    </button>
                                 </div>
                              </div>
                           </div>
                           <StyleConfigurator title="Override Lyrics Style" enabled={activeOutput.lyricsStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { lyricsStyleEnabled: val })} onEdit={() => setEditingStyleType('lyrics')} />
                           <StyleConfigurator title="Override Bible Style" enabled={activeOutput.bibleStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { bibleStyleEnabled: val })} onEdit={() => setEditingStyleType('scripture')} />
                        </>
                     )}
                  </div>
               )}
             </div>
             <div className="p-6 border-t border-white/5 bg-[#030303] flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg"><Save size={16} /> Done</button>
             </div>
          </div>
       </div>
    </div>
    
    {editingStyleType && activeOutput && (
       <OutputStyleEditor
          type={editingStyleType as any}
          outputName={activeOutput.name}
          initialStyle={
             (() => {
                if (editingStyleType === 'background') return { backgrounds: activeOutput.backgrounds };
                const raw = editingStyleType === 'lyrics' ? activeOutput.lyricsStyle : activeOutput.bibleStyle;
                if (!raw) return { global: {} };
                if ('global' in raw || 'layout' in raw) return raw as OutputStyleConfig;
                return { global: raw as React.CSSProperties };
             })()
          }
          onSave={(newStyle: OutputStyleConfig) => {
             if (editingStyleType === 'lyrics') {
                updateOutput(activeOutputId, { lyricsStyle: newStyle as any });
             } else if (editingStyleType === 'scripture') {
                updateOutput(activeOutputId, { bibleStyle: newStyle as any });
             } else if (editingStyleType === 'background') {
                updateOutput(activeOutputId, { backgrounds: newStyle.backgrounds || [] });
             }
             window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Layout overrides saved.' }));
             setEditingStyleType(null);
          }}
          onCancel={() => setEditingStyleType(null)}
       />
    )}
    </>
  );
}

const MOCK_SONGS = [
  {
    id: 'song1',
    title: 'Amazing Grace',
    slides: [
      { id: 's1-1', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me', type: 'lyrics' },
      { id: 's1-3', text: 'I once was lost, but now am found\nWas blind, but now I see.', type: 'lyrics' },
    ] as SlideDefinition[]
  },
  {
    id: 'song2',
    title: 'How Great Thou Art',
    slides: [
      { id: 's2-1', text: 'O Lord my God, When I in awesome wonder\nConsider all the worlds Thy Hands have made', type: 'lyrics' },
      { id: 's2-3', text: 'I see the stars, I hear the rolling thunder\nThy power throughout the universe displayed', type: 'lyrics' },
    ] as SlideDefinition[]
  }
];

function ControlPanel() {
  // Enhanced UI State that persists immediately
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'bibles' | 'media' | 'audio'>('songs');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [activeBibleId, setActiveBibleId] = useState<string | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [songsList, setSongsList] = useState(MOCK_SONGS);
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [previewSlide, setPreviewSlide] = useState<SlideDefinition | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [detectedScreens, setDetectedScreens] = useState<any[]>([]);
  const [primaryScreenLabel, setPrimaryScreenLabel] = useState<string | null>(null);

  // Expose global toast function
  useEffect(() => {
    const handleToast = (e: any) => {
       setToastMessage(e.detail);
       setTimeout(() => setToastMessage(null), 3000);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  // Poll for displays automatically
  useEffect(() => {
    let isDetecting = false;
    const fetchScreens = async () => {
        if (isDetecting) return;
        isDetecting = true;
        if (window.electronAPI) {
          try {
            const screens = await window.electronAPI.getScreens();
            const pScreen = screens.find((s:any) => s.bounds.x === 0 && s.bounds.y === 0) || screens[0];
            if (pScreen) setPrimaryScreenLabel(pScreen.label);
            setDetectedScreens(screens);
          } catch (err) {}
        } else if ('getScreenDetails' in window) {
          try {
            const details = await (window as any).getScreenDetails();
            const pScreen = details.screens.find((s: any) => s.isPrimary);
            if (pScreen) setPrimaryScreenLabel(pScreen.label);
            setDetectedScreens(details.screens);
          } catch (err) {}
        }
        isDetecting = false;
    };
    fetchScreens(); // run once immediately
    const intervalId = setInterval(fetchScreens, 2000); // verify constantly
    return () => clearInterval(intervalId);
  }, []);

  // Load state and settings robustly
  useEffect(() => {
    get('ui_activeTab').then(v => { if (v) setActiveTab(v as any); });
    get('ui_isSidebarVisible').then(v => { if (v !== undefined) setIsSidebarVisible(v as boolean); });
    get('ui_activeBibleId').then(v => { if (v) setActiveBibleId(v as string); });

    get('globalSettings').then((val: any) => { 
        if (val) {
            const mergedOutputs = DEFAULT_SETTINGS.outputs.map(defOut => {
                const savedOut = val.outputs?.find((o: any) => o.id === defOut.id);
                if (savedOut) {
                    let migratedBackgrounds = defOut.backgrounds;
                    if (savedOut.backgrounds && Array.isArray(savedOut.backgrounds)) {
                        migratedBackgrounds = savedOut.backgrounds.map((bg: any) => ({
                            ...bg,
                            layout: bg.layout || { x: 0, y: 0, width: 1, height: 1 },
                            opacity: bg.opacity ?? 100,
                            id: bg.id || `bg-${Date.now()}-${Math.random()}`
                        }));
                    } else if (savedOut.defaultBackground) {
                        migratedBackgrounds = [{
                            id: 'legacy-bg',
                            type: savedOut.defaultBackground.type || 'none',
                            url: savedOut.defaultBackground.url,
                            color: savedOut.defaultBackground.color,
                            fileName: savedOut.defaultBackground.fileName,
                            opacity: savedOut.defaultBackground.opacity ?? 100,
                            layout: { x: 0, y: 0, width: 1, height: 1 }
                        }];
                    }

                    return { 
                        ...defOut, 
                        ...savedOut, 
                        enabled: savedOut.enabled !== undefined ? savedOut.enabled : defOut.enabled,
                        backgrounds: migratedBackgrounds,
                        lyricsStyle: { ...(defOut.lyricsStyle as any), ...(savedOut.lyricsStyle as any) },
                        bibleStyle: { ...(defOut.bibleStyle as any), ...(savedOut.bibleStyle as any) }
                    };
                }
                return defOut;
            });
            setGlobalSettings({ ...DEFAULT_SETTINGS, ...val, outputs: mergedOutputs });
        }
    });
    get('songsList').then((val) => { if (val) setSongsList(val); });
  }, []);

  // Aggressive sync: Push state to DB immediately upon any structural change
  useEffect(() => { set('ui_activeTab', activeTab).catch(()=>{}); }, [activeTab]);
  useEffect(() => { set('ui_isSidebarVisible', isSidebarVisible).catch(()=>{}); }, [isSidebarVisible]);
  useEffect(() => { if (activeBibleId) set('ui_activeBibleId', activeBibleId).catch(()=>{}); }, [activeBibleId]);

  useEffect(() => {
    set('globalSettings', globalSettings).catch(()=>{});
    setLiveState(prev => ({ ...prev, settings: globalSettings }));
  }, [globalSettings]);

  useEffect(() => { 
    if (songsList !== MOCK_SONGS) set('songsList', songsList).catch(() => {}); 
  }, [songsList]);

  useEffect(() => {
    const handleGlobalSave = (e: KeyboardEvent) => {
       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          // Because state is automatically synced to IDB on change via the above useEffects, 
          // pressing Ctrl+S acts as a confirmation boundary for the user.
          window.dispatchEvent(new CustomEvent('app-toast', { detail: 'All active edits saved locally.' }));
       }
    };
    window.addEventListener('keydown', handleGlobalSave);
    return () => window.removeEventListener('keydown', handleGlobalSave);
  }, []);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'song'|'bible'|'slide', id: string | number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const [bibleList, setBibleList] = useState<{id: string, name: string}[]>([]);
  const [activeBibleData, setActiveBibleData] = useState<BibleVersion | null>(null);
  
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleKeywordQuery, setBibleKeywordQuery] = useState('');
  const [bibleKeywordResults, setBibleKeywordResults] = useState<SlideDefinition[]>([]);
  const [bibleHistory, setBibleHistory] = useState<SlideDefinition[]>([]);
  const [showBibleHistory, setShowBibleHistory] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [activeBibleBookIndex, setActiveBibleBookIndex] = useState<number | null>(null);
  const [activeBibleChapterIndex, setActiveBibleChapterIndex] = useState<number | null>(null);
  const [activeBibleVerseIndex, setActiveBibleVerseIndex] = useState<number | null>(null);
  
  const bIndexRef = useRef(activeBibleBookIndex);
  const cIndexRef = useRef(activeBibleChapterIndex);
  const vIndexRef = useRef(activeBibleVerseIndex);
  const verseListRef = useRef<HTMLDivElement>(null);
  const bookListRef = useRef<HTMLDivElement>(null);
  const chapterListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bIndexRef.current = activeBibleBookIndex; }, [activeBibleBookIndex]);
  useEffect(() => { cIndexRef.current = activeBibleChapterIndex; }, [activeBibleChapterIndex]);
  useEffect(() => { vIndexRef.current = activeBibleVerseIndex; }, [activeBibleVerseIndex]);

  const isShowingThreeColumns = !bibleSearchQuery && !bibleKeywordQuery && !showBibleHistory;

  useEffect(() => {
      if (activeBibleBookIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (bookListRef.current) {
                  const el = bookListRef.current.children[activeBibleBookIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleBookIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleChapterIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (chapterListRef.current) {
                  const el = chapterListRef.current.children[activeBibleChapterIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleChapterIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleVerseIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (verseListRef.current) {
                  const el = verseListRef.current.children[activeBibleVerseIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 20);
      }
  }, [activeBibleVerseIndex, isShowingThreeColumns]);

  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  const [renamePrompt, setRenamePrompt] = useState<{type: 'song'|'bible', id: string, currentName: string} | null>(null);
  const [isEditingSong, setIsEditingSong] = useState(false);
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, settings: globalSettings, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  // Spawns a floating popup on the Primary Screen (so the operator can see the specific output without an external monitor)
  const openProjectorPreview = (outputId: string) => {
    const url = `#/projector/${outputId}`;
    const wFeatures = 'popup=yes,menubar=no,toolbar=no,location=no,status=no,width=1280,height=720';
    window.open(url, `FlowShow_Preview_${outputId}`, wFeatures);
  };

  const togglePresenting = async () => {
    const willBeLive = !liveState.isPresenting;
    setLiveState(prev => ({ ...prev, isPresenting: willBeLive }));
    
    if (willBeLive) {
       for (const out of globalSettings.outputs) {
          if (out.enabled && out.displayId) {
             if (window.electronAPI) {
                 await window.electronAPI.openProjector(out.id, out.displayId);
             } else {
                 alert('Live broadcasting requires the Electron desktop app.');
             }
          }
       }
    } else {
       if (window.electronAPI) {
           await window.electronAPI.closeProjectors();
       } else {
           const channel = new BroadcastChannel(CHANNEL_NAME);
           channel.postMessage({ type: 'CLOSE_WINDOW' });
           channel.close();
       }
    }
  };

  const toggleClearOutput = (outputId: string) => {
    setLiveState(prev => ({
        ...prev,
        clearedOutputs: { ...prev.clearedOutputs, [outputId]: !prev.clearedOutputs?.[outputId] }
    }));
  };

  const toggleLockOutput = (outputId: string) => {
    setLiveState(prev => {
        const isCurrentlyLocked = !!prev.lockedOutputs?.[outputId];
        if (isCurrentlyLocked) {
            const newLocked = { ...prev.lockedOutputs };
            delete newLocked[outputId];
            const newFrozen = { ...prev.frozenStates };
            delete newFrozen[outputId];
            return { ...prev, lockedOutputs: newLocked, frozenStates: newFrozen };
        } else {
            const outputConfig = prev.settings?.outputs.find(o => o.id === outputId);
            
            let activeBackgrounds = outputConfig?.backgrounds || [];
            if (outputId === 'main' && prev.globalBackground) {
               activeBackgrounds = [{
                  id: 'global-lock',
                  type: prev.globalBackground.type as any,
                  url: prev.globalBackground.url,
                  layout: { x: 0, y: 0, width: 1, height: 1 },
                  opacity: 100
               }];
            }

            return {
                ...prev,
                lockedOutputs: { ...prev.lockedOutputs, [outputId]: true },
                frozenStates: {
                    ...prev.frozenStates,
                    [outputId]: { slide: prev.slide, bgs: activeBackgrounds, clearText: prev.clearText }
                }
            };
        }
    });
  };

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setVideoCurrentTime(video.currentTime);
    const handleDurationChange = () => setVideoDuration(video.duration);
    const handlePlay = () => setIsVideoPlaying(true);
    const handlePause = () => setIsVideoPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [liveState.globalBackground, liveState.settings, activeTab]); 

  const broadcastVideoCommand = (command: string, value?: any) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'VIDEO_CMD', command, value });
    channel.close();
  };

  const togglePlay = () => {
    const nextState = !isVideoPlaying;
    setIsVideoPlaying(nextState);
    
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
       if (nextState) v.play().catch(()=>{});
       else v.pause();
    });

    broadcastVideoCommand(nextState ? 'play' : 'pause');
  };

  const toggleMute = () => {
    const nextState = !isVideoMuted;
    setIsVideoMuted(nextState);
    broadcastVideoCommand('mute', nextState);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setVideoCurrentTime(time);
    
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
        v.currentTime = time;
    });

    broadcastVideoCommand('seek', time);
  };

  const pushToBibleHistory = (slide: SlideDefinition) => {
     if (slide.type !== 'scripture') return;
     setBibleHistory(prev => {
        const filtered = prev.filter(s => s.id !== slide.id);
        return [slide, ...filtered].slice(0, 50);
     });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
         e.preventDefault();
         if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex >= 0 && currentIndex < currentSong.slides.length - 1) {
               const nextSlide = currentSong.slides[currentIndex + 1];
               setPreviewSlide(nextSlide);
               goLive(nextSlide);
            } else if (currentIndex === -1 && currentSong.slides.length > 0) {
               setPreviewSlide(currentSong.slides[0]);
               goLive(currentSong.slides[0]);
            }
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? -1;
            if (currentIdx < verses.length - 1) {
               const nextIdx = currentIdx + 1;
               setActiveBibleVerseIndex(nextIdx);
               const v = verses[nextIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
         e.preventDefault();
         if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex > 0) {
               const prevSlide = currentSong.slides[currentIndex - 1];
               setPreviewSlide(prevSlide);
               goLive(prevSlide);
            }
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? 0;
            if (currentIdx > 0) {
               const prevIdx = currentIdx - 1;
               setActiveBibleVerseIndex(prevIdx);
               const v = verses[prevIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeItemIndex, activeBibleData, activeBibleBookIndex, activeBibleChapterIndex, activeBibleVerseIndex, liveState, previewSlide, songsList, isShowingThreeColumns]);

  useEffect(() => {
    initDatabase().then(() => { getBibleList().then(list => { setBibleList(list); if (list.length > 0 && !activeBibleId) setActiveBibleId(list[0].id); }); })
    .catch(err => { getBibleList().then(list => { setBibleList(list); if (list.length > 0 && !activeBibleId) setActiveBibleId(list[0].id); }); });
  }, []);

  useEffect(() => {
    if (activeBibleId) { 
        getBible(activeBibleId).then(data => { 
            if (data) { 
                setActiveBibleData(data); 
                
                const bIdx = bIndexRef.current !== null ? Math.min(bIndexRef.current, data.books.length - 1) : 0;
                const cIdx = cIndexRef.current !== null ? Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1) : 0;
                const vIdx = vIndexRef.current !== null ? Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1) : 0;

                if (bIndexRef.current === null) {
                    setActiveBibleBookIndex(0);
                    setActiveBibleChapterIndex(0);
                    setActiveBibleVerseIndex(0);
                } else {
                    setActiveBibleBookIndex(bIdx);
                    setActiveBibleChapterIndex(cIdx);
                    setActiveBibleVerseIndex(vIdx);

                    const v = data.books[bIdx].chapters[cIdx].verses[vIdx];
                    const slide: SlideDefinition = { id: `b-${data.books[bIdx].name}-${data.books[bIdx].chapters[cIdx].c}-${v.v}`, text: v.lines.join('\n'), source: `${data.books[bIdx].name} ${data.books[bIdx].chapters[cIdx].c}:${v.v}`, type: 'scripture' };
                    
                    setPreviewSlide(slide); 
                }
            }
        }); 
    }
    else { 
        setActiveBibleData(null); 
        setActiveBibleBookIndex(null); 
        setActiveBibleChapterIndex(null); 
        setActiveBibleVerseIndex(null);
    }
  }, [activeBibleId]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(liveState);
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_CURRENT_STATE') {
        channel.postMessage({ ...liveState, videoInitState: { time: liveVideoRef.current?.currentTime || 0, muted: isVideoMuted, playing: isVideoPlaying } });
      }
    };
    return () => channel.close();
  }, [liveState, isVideoMuted, isVideoPlaying]);

  const goLive = (slide: SlideDefinition) => {
      setLiveState(prev => ({ ...prev, slide, clearText: false, clearedOutputs: {} }));
      setPreviewSlide(slide);
  };
  
  const setGlobalBackground = (url: string | null, type: 'image' | 'video' = 'image') => {
      setLiveState(prev => ({ ...prev, globalBackground: url ? { url, type } : null, clearedOutputs: {} }));
  };

  const handleJumpToVerse = (slide: SlideDefinition, isDoubleClick: boolean = false) => {
      if (activeBibleData && slide.source) {
          const match = slide.source.match(/^(.+)\s+(\d+):(\d+)$/);
          if (match) {
              const bName = match[1];
              const cNum = parseInt(match[2], 10);
              const vNum = parseInt(match[3], 10);

              const bIdx = activeBibleData.books.findIndex(b => b.name === bName);
              if (bIdx !== -1) {
                  setActiveBibleBookIndex(bIdx);
                  const cIdx = activeBibleData.books[bIdx].chapters.findIndex(c => c.c === cNum);
                  if (cIdx !== -1) {
                      setActiveBibleChapterIndex(cIdx);
                      const vIdx = activeBibleData.books[bIdx].chapters[cIdx].verses.findIndex(v => v.v === vNum);
                      if (vIdx !== -1) {
                          setActiveBibleVerseIndex(vIdx);
                      }
                  }
              }
          }
      }

      setBibleSearchQuery('');
      setBibleKeywordQuery('');
      setShowBibleHistory(false);
      
      setPreviewSlide(slide);
      pushToBibleHistory(slide);

      if (isDoubleClick) {
         goLive(slide);
      } else if (liveState.slide?.type === 'scripture' && !liveState.clearText) {
         goLive(slide);
      }
  };

  const handleVerseClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     setPreviewSlide(slide);
     pushToBibleHistory(slide);
     if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
  };

  const handleVerseDoubleClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     pushToBibleHistory(slide);
     goLive(slide);
  };

  const handleKeywordSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setBibleKeywordQuery(val);
      setBibleSearchQuery('');
      setShowBibleHistory(false);
      
      if (!activeBibleData || !val.trim()) {
          setBibleKeywordResults([]);
          return;
      }

      const terms = val.toLowerCase().split(/\s+/).filter(Boolean);
      let results: {slide: SlideDefinition, score: number}[] = [];
      
      for (const b of activeBibleData.books) {
         for (const c of b.chapters) {
            for (const v of c.verses) {
               const text = v.lines.join(' ').toLowerCase();
               let score = 0;
               let allMatch = true;
               for (const t of terms) {
                  if (text.includes(t)) score += 1;
                  else allMatch = false; 
               }
               if (allMatch) {
                  if (text.includes(val.toLowerCase())) score += 10;
                  results.push({
                     slide: { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' },
                     score
                  });
               }
            }
         }
      }
      results.sort((a, b) => b.score - a.score);
      setBibleKeywordResults(results.slice(0, 50).map(r => r.slide));
  };

  const handleBibleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    setBibleKeywordQuery('');
    setShowBibleHistory(false);
    
    if (!activeBibleData) {
        setBibleSearchQuery(val);
        return;
    }

    const match = val.match(/^(\d?\s*[a-zA-Z]+)(?:([\s:]+)(\d+))?(?:([\s:]+)(\d+))?([:\s]*)$/);
    
    if (match) {
        const bStr = match[1];
        const cSep = match[2] || '';
        const cStr = match[3];
        const vSep = match[4] || '';
        const vStr = match[5];
        const trailing = match[6] || '';

        const resolveAlias = (q: string) => {
            const str = q.toLowerCase().replace(/\s/g, '');
            if (str === 'duet' || str === 'deut') return 'deuteronomy';
            if (str === 'ps') return 'psalms';
            if (str === 'song' || str === 'sos') return 'songofsolomon';
            if (str === 'rev') return 'revelation';
            return str;
        };

        const bSearch = resolveAlias(bStr);
        const bIdx = activeBibleData.books.findIndex(b => b.name.toLowerCase().replace(/\s/g, '').startsWith(bSearch));
        
        if (bIdx !== -1) {
            setActiveBibleBookIndex(bIdx);
            const book = activeBibleData.books[bIdx];
            let finalVal = bStr;
            
            if (cStr) {
                let cNum = parseInt(cStr, 10);
                const maxC = book.chapters.length;
                if (cNum > maxC) cNum = maxC; 
                if (cNum < 1) cNum = 1;
                finalVal += cSep + cNum;
                
                const cIdx = cNum - 1;
                if (cIdx >= 0 && cIdx < maxC) {
                    setActiveBibleChapterIndex(cIdx);
                    const chapter = book.chapters[cIdx];
                    
                    if (vStr) {
                        let vNum = parseInt(vStr, 10);
                        const maxV = Math.max(...chapter.verses.map(v => v.v));
                        if (vNum > maxV) vNum = maxV;
                        if (vNum < 1) vNum = 1;
                        finalVal += vSep + vNum;

                        const vIdx = chapter.verses.findIndex(v => v.v === vNum);
                        if (vIdx !== -1) {
                            setActiveBibleVerseIndex(vIdx);
                        }
                    } else {
                        setActiveBibleVerseIndex(null);
                    }
                }
            } else {
                setActiveBibleChapterIndex(null);
                setActiveBibleVerseIndex(null);
            }
            finalVal += trailing;
            val = finalVal;
        }
    }
    setBibleSearchQuery(val);
  };

  const handleBibleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeBibleData) return;
    
    if (e.key === ' ' || e.key === 'ArrowRight') {
        if (activeBibleBookIndex !== null) {
            const book = activeBibleData.books[activeBibleBookIndex];
            
            if (!/\d/.test(bibleSearchQuery) || /^[1-3]\s*[a-zA-Z]+$/.test(bibleSearchQuery)) {
                e.preventDefault();
                setBibleSearchQuery(`${book.name} `);
                return;
            }
            
            const chapMatch = bibleSearchQuery.match(/^(\d?\s*[a-zA-Z]+\s+\d+)$/);
            if (chapMatch) {
                e.preventDefault();
                setBibleSearchQuery(`${chapMatch[1]}:`);
                return;
            }
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleVerseIndex !== null) {
            const b = activeBibleData.books[activeBibleBookIndex];
            const c = b.chapters[activeBibleChapterIndex];
            const v = c.verses[activeBibleVerseIndex];
            const slide = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' as SlideType };
            handleJumpToVerse(slide, true);
        }
    }
  };

  const handleVerseDetected = (reference: any) => {
     const bookSearch = reference.book;
     const chapterSearch = reference.chapters[0];
     const verseSearch = reference.verses?.[0]?.[0] || 1;
     const sourceString = `${bookSearch} ${chapterSearch}:${verseSearch}`;
     let foundText = `Finding: ${sourceString}...`;

     if (activeBibleData) {
       const book = activeBibleData.books.find(b => b.name.toLowerCase().startsWith(bookSearch.toLowerCase()));
       if (book) {
         const chapter = book.chapters.find(c => c.c === chapterSearch);
         if (chapter) {
           const verse = chapter.verses.find(v => v.v === verseSearch);
           if (verse) foundText = verse.text;
           else foundText = `[Verse ${verseSearch} not found]`;
         } else foundText = `[Chapter ${chapterSearch} not found]`;
       } else foundText = `[Book ${bookSearch} not found]`;
     }
     const slide = { id: `auto-${Date.now()}`, type: 'scripture' as SlideType, text: foundText, source: sourceString };
     pushToBibleHistory(slide);
     goLive(slide);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const newBible = await parseBibleXml(file);
      await saveBible(newBible);
      const list = await getBibleList();
      setBibleList(list);
      setActiveBibleId(newBible.id);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Bible imported successfully!' }));
    } catch (err) { alert("Failed to parse Bible XML. " + err); } 
    finally { setIsUploading(false); if (e.target) e.target.value = ''; }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'song'|'bible'|'slide', id: string|number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const deleteSong = (id: string | number) => {
    let indexToRemove = -1;
    setSongsList(prev => { indexToRemove = prev.findIndex(s => s.id === id); return prev.filter(s => s.id !== id); });
    if (indexToRemove !== -1) setActiveItemIndex(prevIndex => (prevIndex >= indexToRemove && prevIndex > 0 ? prevIndex - 1 : prevIndex));
  };

  const handleDeleteBible = async (id: string) => {
    await deleteBible(id);
    const list = await getBibleList();
    setBibleList(list);
    if (activeBibleId === id) setActiveBibleId(list.length > 0 ? list[0].id : null);
  };

  const toggleClearText = () => {
     setLiveState(prev => ({ ...prev, clearText: !prev.clearText }));
     setPreviewSlide(null);
  };
  const clearAll = () => {
     setLiveState(prev => ({ ...prev, slide: undefined, globalBackground: null, clearText: false, clearedOutputs: {} }));
     setPreviewSlide(null);
  };

  const handleSplitSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const slideToSplit = slides[index]; const lines = slideToSplit.text.split('\n');
      if (lines.length <= 1) return prev;
      const mid = Math.ceil(lines.length / 2);
      const slide1 = { ...slideToSplit, text: lines.slice(0, mid).join('\n') };
      const slide2 = { ...slideToSplit, text: lines.slice(mid).join('\n'), id: `s-${Date.now()}` };
      slides[index] = slide1; slides.splice(index + 1, 0, slide2);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDuplicateSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      slides.splice(index + 1, 0, { ...slides[index], id: `s-${Date.now()}` });
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDeleteSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; let slides = [...song.slides];
      if (slides.length <= 1) slides[index] = { ...slides[index], text: '' }; else slides.splice(index, 1);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDropSlide = (targetIndex: number) => {
    if (draggedSlideIndex === null || draggedSlideIndex === targetIndex || activeTab !== 'songs' || !songsList[activeItemIndex]) {
      setDraggedSlideIndex(null); setDragOverSlideIndex(null); return;
    }
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const [draggedSlide] = slides.splice(draggedSlideIndex, 1); slides.splice(targetIndex, 0, draggedSlide);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
    setDraggedSlideIndex(null); setDragOverSlideIndex(null);
  };

  // --- RENDER COMPONENTS ---

  const renderSidebarList = () => {
    if (activeTab === 'songs') {
      const filteredSongs = songsList.filter(song => {
         if (!songSearchQuery.trim()) return true;
         const q = songSearchQuery.toLowerCase();
         if (song.title.toLowerCase().includes(q)) return true;
         return song.slides.some(s => s.text.toLowerCase().includes(q));
      }).sort((a, b) => {
         if (!songSearchQuery.trim()) return 0;
         const q = songSearchQuery.toLowerCase();
         const aTitle = a.title.toLowerCase().includes(q);
         const bTitle = b.title.toLowerCase().includes(q);
         if (aTitle && !bTitle) return -1;
         if (!aTitle && bTitle) return 1;
         return 0;
      });

      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <div className="relative">
               <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
               <input 
                 type="text" 
                 placeholder="Search Songs & Lyrics..." 
                 value={songSearchQuery}
                 onChange={(e) => setSongSearchQuery(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-neutral-200 placeholder:text-neutral-500" 
               />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {filteredSongs.map((song) => {
              const originalIndex = songsList.findIndex(s => s.id === song.id);
              return (
                 <div key={song.id} onContextMenu={(e) => handleContextMenu(e, 'song', song.id)} onClick={() => setActiveItemIndex(originalIndex)} className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center transition-colors ${activeItemIndex === originalIndex ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                   <div className="flex items-center gap-3 min-w-0"><FileText size={14} className={activeItemIndex === originalIndex ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} /><span className="text-sm font-medium truncate">{song.title}</span></div>
                 </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-white/5 shrink-0">
             <button onClick={() => setIsAddSongModalOpen(true)} className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-neutral-300 flex justify-center items-center gap-2 transition-all"><Plus size={14} /> New Song</button>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <label className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-lg cursor-pointer transition-all">
                {isUploading ? <Activity size={14} className="animate-spin" /> : <Upload size={14} />} {isUploading ? 'Parsing XML...' : 'Import XML Bible'}
                <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
             </label>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {bibleList.length === 0 ? (
               <div className="p-6 text-center text-sm text-neutral-500">No Bibles imported.</div>
            ) : (
               bibleList.map((bible) => (
                <div 
                  key={bible.id} 
                  onContextMenu={(e) => handleContextMenu(e, 'bible', bible.id)} 
                  onClick={() => setActiveBibleId(bible.id)} 
                  onDoubleClick={async () => {
                      const data = await getBible(bible.id);
                      if (data && bIndexRef.current !== null && cIndexRef.current !== null && vIndexRef.current !== null) {
                         const bIdx = Math.min(bIndexRef.current, data.books.length - 1);
                         const cIdx = Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1);
                         const vIdx = Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1);
                         const b = data.books[bIdx];
                         const c = b.chapters[cIdx];
                         const v = c.verses[vIdx];
                         const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
                         setPreviewSlide(slide);
                         goLive(slide);
                      }
                  }}
                  className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center transition-colors ${activeBibleId === bible.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                  <div className="flex items-center gap-3 min-w-0"><BookOpen size={14} className={activeBibleId === bible.id ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} /><span className="text-sm font-medium truncate">{bible.name}</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderCenterWorkspace = () => {
    if (activeTab === 'media') return <MediaLibrary onSelectBackground={setGlobalBackground} />;
    if (activeTab === 'audio') return <AudioModule onVerseDetected={handleVerseDetected} />;

    if (isEditingSong && activeTab === 'songs' && songsList[activeItemIndex]) {
      return (
        <EditSongPage 
          song={songsList[activeItemIndex]} initialSlideIndex={editingSlideIndex || 0} onClose={() => setIsEditingSong(false)}
          onSave={(songId, updatedSlides) => {
            setSongsList(prev => { const next = [...prev]; const idx = next.findIndex(s => s.id === songId); if (idx !== -1) next[idx] = { ...next[idx], slides: updatedSlides }; return next; });
            setLiveState(prev => { if (prev.slide) { const match = updatedSlides.find(s => s.id === prev.slide!.id); if (match) return { ...prev, slide: match }; } return prev; });
          }}
        />
      );
    }

    if (activeTab === 'bibles') {
      const isSearchingKeyword = bibleKeywordQuery.trim().length > 0;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           <div className="p-4 border-b border-white/5 shrink-0 flex flex-wrap gap-4 items-center bg-[#09090B] shadow-sm z-10 relative">
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleSearchQuery} 
                   onChange={handleBibleSearchChange}
                   onKeyDown={handleBibleSearchKeyDown}
                   placeholder="Ref (Joh 3 16)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleKeywordQuery} 
                   onChange={handleKeywordSearchChange}
                   placeholder="Keyword (God so loved)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <button 
                 onClick={() => {
                     setBibleSearchQuery('');
                     setBibleKeywordQuery('');
                     setShowBibleHistory(!showBibleHistory);
                 }}
                 className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${showBibleHistory ? 'bg-blue-600 text-white shadow-md' : 'bg-white/5 border border-transparent text-neutral-400 hover:text-white hover:bg-white/10'}`}
              >
                 <Clock size={16} /> History
              </button>
              <span className="text-sm font-medium text-neutral-400 ml-auto">{activeBibleData?.name || 'No Bible Selected'}</span>
           </div>

           {showBibleHistory ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Clock size={20}/> Session History</h2>
                 {bibleHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm">No verses viewed in this session yet.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleHistory.map((slide, idx) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={`${slide.id}-${idx}`} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : isSearchingKeyword ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 {bibleKeywordResults.length === 0 ? (
                    <div className="text-center text-neutral-500 text-sm mt-10">No keyword matches found.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleKeywordResults.map((slide) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={slide.id} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : (
              <div className="flex flex-1 min-h-0 overflow-hidden bg-[#09090B]">
                 <div className="w-48 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={bookListRef}>
                    {activeBibleData?.books.map((book, idx) => (
                       <button key={book.name} onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(0); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-left px-5 py-3 text-sm border-b border-white/5 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold border-l-2 border-l-blue-500' : 'text-neutral-400 hover:bg-white/5 hover:text-white border-l-2 border-l-transparent'}`}>{book.name}</button>
                    ))}
                 </div>
                 <div className="w-20 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={chapterListRef}>
                    {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                       <button key={chapter.c} onClick={() => { setActiveBibleChapterIndex(idx); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-center px-2 py-3 text-sm border-b border-white/5 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-inner' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>{chapter.c}</button>
                    ))}
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#09090B]">
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto" ref={verseListRef}>
                      {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map((verse, vIdx) => {
                         const slide: SlideDefinition = { id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`, text: verse.lines.join('\n'), source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`, type: 'scripture' };
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         const isNextLogical = activeBibleVerseIndex !== null && vIdx === activeBibleVerseIndex + 1;
                         
                         return (
                            <div 
                               key={verse.v} 
                               onClick={() => handleVerseClick(slide, vIdx)}
                               onDoubleClick={() => handleVerseDoubleClick(slide, vIdx)}
                               className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                            >
                               <span className={`text-xs font-bold mt-1.5 shrink-0 w-8 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{verse.v}</span>
                               <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{verse.lines.join('\n')}</p>
                            </div>
                         );
                      })}
                    </div>
                 </div>
              </div>
           )}
        </div>
      );
    }

    if (activeTab === 'songs') {
      const activeSong = songsList[activeItemIndex];
      if (!activeSong) return <div className="flex-1 flex items-center justify-center text-neutral-500">No Song Selected</div>;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           {/* Toolbar */}
           <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
             <div className="flex items-center gap-3">
                <Music size={18} className="text-blue-500" />
                <h2 className="text-lg font-semibold text-white tracking-wide">{activeSong.title}</h2>
             </div>
             <button className="text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors text-neutral-300 font-medium">Edit Layout</button>
           </div>
           
           {/* Slide Grid (Now ~4x larger context) */}
           <div className="flex-1 overflow-y-auto p-4 bg-[#09090B] custom-scrollbar z-0">
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 content-start">
                 {activeSong.slides.map((slide, i) => {
                    const isLive = liveState.slide?.id === slide.id;
                    const isPreview = previewSlide?.id === slide.id;
                    
                    const currentSlideId = previewSlide?.id || liveState.slide?.id;
                    const currentIndex = activeSong.slides.findIndex(s => s.id === currentSlideId);
                    const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                    return (
                       <div 
                         key={slide.id} draggable
                         onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }} onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                         onContextMenu={(e) => handleContextMenu(e, 'slide', i)} onClick={() => { if (!slide.disabled) { setPreviewSlide(slide); goLive(slide); } }}
                         className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                           ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''} ${isLive ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.25)]' : isPreview ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.2)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'} ${dragOverSlideIndex === i ? 'border-dashed border-emerald-400 opacity-70' : ''}
                         `}
                       >
                         <FixedStage className="w-full h-full pointer-events-none">
                            <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'))} />
                         </FixedStage>
                         
                         {/* Slide Number Badge */}
                         <div className="absolute top-3 left-3 text-xs font-bold text-neutral-400 bg-[#09090B]/90 px-2.5 py-1.5 rounded-md shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                       </div>
                    );
                 })}
              </div>
           </div>
        </div>
      );
    }
  };

  // --- REDESIGNED BROADCAST MONITOR BRIDGE ---
  const renderMonitorBridge = () => {
     const mainConfig = liveState.settings?.outputs.find(o => o.id === 'main');
     const otherOutputs = liveState.settings?.outputs.filter(o => o.enabled && o.id !== 'main') || [];
     
     let activePreviewBackgrounds = mainConfig?.backgrounds || [];
     if (liveState.globalBackground) {
        activePreviewBackgrounds = [{ id: 'global', type: liveState.globalBackground.type as any, url: liveState.globalBackground.url, layout: { x: 0, y: 0, width: 1, height: 1 }, opacity: 100 }];
     }

     return (
       <div className="bg-[#030303] flex p-3 gap-4 shrink-0 z-20 h-44 lg:h-52 w-full justify-center shadow-2xl border-b border-white/10">
         <div className="flex gap-4 w-full max-w-[2400px]">
           
           {/* --- PREVIEW MONITOR --- */}
           <div className="flex-1 flex flex-col min-w-0 group">
             <div className="flex items-center gap-2 mb-1.5 px-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
               <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/90">Preview</span>
             </div>
             
             <div className="flex-1 w-full bg-black rounded-sm border-2 border-emerald-500/30 group-hover:border-emerald-500/60 overflow-hidden relative shadow-inner flex items-center justify-center transition-all">
               <FixedStage className="w-full h-full pointer-events-none scale-[1.01]">
                  
                  {activePreviewBackgrounds.map((bg, idx) => (
                      <div key={bg.id} style={{ position: 'absolute', zIndex: 10 + idx, left: `${(bg.layout?.x || 0)*100}%`, top: `${(bg.layout?.y || 0)*100}%`, width: `${(bg.layout?.width || 1)*100}%`, height: `${(bg.layout?.height || 1)*100}%`, opacity: (bg.opacity ?? 100) / 100 / 2 }}>
                          {bg.type === 'color' && <div className="w-full h-full" style={{ backgroundColor: bg.color || '#000' }} />}
                          {bg.type === 'video' && <video src={bg.url} className="w-full h-full object-cover" autoPlay loop muted playsInline />}
                          {bg.type === 'image' && <img src={bg.url} className="w-full h-full object-cover" alt="bg" />}
                      </div>
                  ))}
                  
                  {previewSlide && (
                     <div style={{ position: 'absolute', zIndex: 100, inset: 0, width: '100%', height: '100%' }}>
                        <SmartTextLayout text={previewSlide.text} source={previewSlide.source} type={previewSlide.type} styleOverrides={applyGlobalStyles(previewSlide, mainConfig)} />
                     </div>
                  )}

                  {activePreviewBackgrounds.length === 0 && !previewSlide && (
                     <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/10 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                  )}
               </FixedStage>
             </div>
             {/* Technical Info Bar */}
             <div className="flex justify-between items-center px-1 mt-1.5 text-[9px] font-mono text-neutral-600 uppercase tracking-tighter">
               <span className="flex items-center gap-1"><ChevronRight size={10}/> Next Slide</span>
               <span>{previewSlide?.type || 'Empty'}</span>
             </div>
           </div>

           {/* --- PROGRAM MONITOR --- */}
           <div className="flex-1 flex flex-col min-w-0 group">
             <div className="flex justify-between items-center px-1 mb-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${liveState.isPresenting ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-neutral-800'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${liveState.isPresenting ? 'text-red-500' : 'text-neutral-600'}`}>
                    Program
                  </span>
                </div>
                
                <div className="flex items-center gap-2 z-10">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleLockOutput('main'); }} 
                      className={`text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${liveState.lockedOutputs?.['main'] ? 'text-red-500' : 'text-neutral-500 hover:text-white'}`}
                      title="Lock Screen"
                    >
                      <Lock size={10} /> Lock
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleClearOutput('main'); }} className={`p-1 rounded transition-colors text-[9px] flex items-center gap-1 ${liveState.clearedOutputs?.['main'] ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`} title="Clear Text from Main"><EyeOff size={10} /> {liveState.clearedOutputs?.['main'] ? 'Cleared' : 'Clear'}</button>
                    <button onClick={(e) => { e.stopPropagation(); openProjectorPreview('main'); }} className="text-neutral-500 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Launch Local Preview Screen"><LaunchIcon size={12} /></button>
                </div>
             </div>
             
             <div onClick={() => openProjectorPreview('main')} className={`flex-1 w-full min-h-0 bg-black rounded-sm border-2 overflow-hidden relative shadow-inner cursor-pointer flex items-center justify-center transition-all duration-300 ${liveState.isPresenting ? 'border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.15)]' : 'border-white/5'}`} title="Click to open local preview window">
                <FixedStage className="w-full h-full pointer-events-none bg-black">
                    {(() => {
                        const isLocked = !!liveState.lockedOutputs?.['main'];
                        const frozenState = liveState.frozenStates?.['main'];
                        const isCleared = !!liveState.clearedOutputs?.['main'];
                        
                        const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
                        const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;
                        
                        let displayBackgrounds = isLocked ? (frozenState?.bgs || []) : (mainConfig?.backgrounds || []);
                        if (!isLocked && liveState.globalBackground) {
                           displayBackgrounds = [{ id: 'global', type: liveState.globalBackground.type as any, url: liveState.globalBackground.url, layout: { x: 0, y: 0, width: 1, height: 1 }, opacity: 100 }];
                        }

                        return (
                          <>
                              {displayBackgrounds.map((bg, idx) => (
                                  <div key={bg.id} style={{ position: 'absolute', zIndex: 10 + idx, left: `${(bg.layout?.x || 0)*100}%`, top: `${(bg.layout?.y || 0)*100}%`, width: `${(bg.layout?.width || 1)*100}%`, height: `${(bg.layout?.height || 1)*100}%`, opacity: (bg.opacity ?? 100) / 100 }}>
                                      {bg.type === 'color' && <div className="w-full h-full" style={{ backgroundColor: bg.color || '#000' }} />}
                                      {bg.type === 'video' && <video ref={liveVideoRef} src={bg.url} className="w-full h-full object-cover" autoPlay loop muted={isVideoMuted} playsInline />}
                                      {bg.type === 'image' && <img src={bg.url} className="w-full h-full object-cover" alt="bg" />}
                                  </div>
                              ))}
                              
                              {!isCleared && !displayClearText && displaySlide && (
                                <div style={{ position: 'absolute', zIndex: 100, inset: 0, width: '100%', height: '100%' }}>
                                  <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, mainConfig)} className="relative w-full h-full animate-in fade-in duration-300" />
                                </div>
                              )}
                              
                              {isCleared && (
                                <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/40 backdrop-blur-sm z-20"><span className="text-neutral-500 font-bold tracking-widest uppercase text-base flex items-center gap-2"><EyeOff size={32}/></span></div>
                              )}
                              {isLocked && (
                                <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={48} className="text-red-500 bg-black/60 p-2.5 rounded-full shadow-[0_0_25px_rgba(239,68,68,0.8)]" /></div>
                              )}
                              {liveState.isPresenting && !isCleared && !isLocked && (
                                 <div className="absolute top-3 right-3 bg-red-600 text-white text-[8px] tracking-widest font-black px-2 py-0.5 rounded-sm shadow-[0_0_15px_rgba(239,68,68,1)] z-40">LIVE</div>
                              )}

                              {displayBackgrounds.length === 0 && (!displaySlide || displayClearText || isCleared) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/5 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                              )}
                          </>
                        )
                    })()}
                </FixedStage>
             </div>
             <div className="flex justify-between items-center px-1 mt-1.5 text-[9px] font-mono text-neutral-600 uppercase tracking-tighter">
                <span>MASTER OUTPUT</span>
                <span>RES: 1920x1080</span>
             </div>
           </div>

           {/* --- AUXILIARY STACK --- */}
           <div className="w-48 xl:w-56 2xl:w-64 flex flex-col gap-2 shrink-0 h-full overflow-y-auto custom-scrollbar border-l border-white/5 pl-4 pr-1">
              <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest mb-0.5">Confidence Monitors</span>
              {otherOutputs.map(out => {
                 const isOutLocked = !!liveState.lockedOutputs?.[out.id];
                 const isOutCleared = !!liveState.clearedOutputs?.[out.id];

                 return (
                     <div key={out.id} className="flex flex-col shrink-0 min-h-0 flex-1">
                        <div className="flex justify-between items-center mb-1 px-1">
                           <span className="text-[9px] uppercase font-bold tracking-widest text-[#a1a1aa]">{out.name}</span>
                           <div className="flex items-center gap-1 z-10">
                              <button onClick={(e) => { e.stopPropagation(); toggleLockOutput(out.id); }} className={`text-[8px] uppercase font-bold tracking-widest px-1 ${isOutLocked ? 'text-red-500' : 'text-neutral-600 hover:text-white transition-colors'}`}>Lock</button>
                              <button onClick={(e) => { e.stopPropagation(); toggleClearOutput(out.id); }} className={`p-0.5 rounded transition-colors text-neutral-600 hover:text-white hover:bg-white/10 ${isOutCleared ? 'text-red-500' : ''}`}><EyeOff size={10} /></button>
                              <button onClick={(e) => { e.stopPropagation(); openProjectorPreview(out.id); }} className="text-neutral-600 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"><LaunchIcon size={10} /></button>
                           </div>
                        </div>
                        <div onClick={() => openProjectorPreview(out.id)} className={`flex-1 aspect-video bg-black rounded-sm border overflow-hidden relative shadow-inner cursor-pointer ${liveState.isPresenting && !isOutLocked && !isOutCleared ? 'border-white/10' : 'border-transparent opacity-50 grayscale-[50%]'}`} title="Click to open local preview">
                            <FixedStage className="w-full h-full pointer-events-none bg-black">
                               {(() => {
                                  const frozenState = liveState.frozenStates?.[out.id];
                                  const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
                                  const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
                                  
                                  const displayBackgrounds = isOutLocked ? (frozenState?.bgs || []) : (out.backgrounds || []);
                                  
                                  // Stage screen clear keeps background intact
                                  const hideBg = isOutCleared && out.id !== 'stage';

                                  return (
                                    <>
                                       {!hideBg && displayBackgrounds.map((bg, idx) => (
                                          <div key={bg.id} style={{ position: 'absolute', zIndex: 10 + idx, left: `${(bg.layout?.x || 0)*100}%`, top: `${(bg.layout?.y || 0)*100}%`, width: `${(bg.layout?.width || 1)*100}%`, height: `${(bg.layout?.height || 1)*100}%`, opacity: (bg.opacity ?? 100) / 100 }}>
                                              {bg.type === 'color' && <div className="w-full h-full" style={{ backgroundColor: bg.color || '#000' }} />}
                                              {bg.type === 'video' && <video src={bg.url} className="w-full h-full object-cover" autoPlay loop playsInline muted />}
                                              {bg.type === 'image' && <img src={bg.url} className="w-full h-full object-cover" alt="bg" />}
                                          </div>
                                       ))}
                                       
                                       {!isOutCleared && !displayClearText && displaySlide && (
                                          <div style={{ position: 'absolute', zIndex: 100, inset: 0, width: '100%', height: '100%' }}>
                                            <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, out)} className="relative w-full h-full animate-in fade-in duration-300" />
                                          </div>
                                       )}

                                       {isOutCleared && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm z-20"><span className="text-neutral-500 flex items-center gap-1"><EyeOff size={24}/></span></div>
                                       )}
                                       {isOutLocked && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={32} className="text-red-500 bg-black/60 p-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" /></div>
                                       )}
                                       {liveState.isPresenting && !isOutCleared && !isOutLocked && (
                                           <div className="absolute top-2 right-2 bg-red-600 text-white text-[8px] tracking-widest font-black px-1.5 py-0.5 rounded-sm shadow-[0_0_10px_rgba(239,68,68,1)] z-40">LIVE</div>
                                       )}
                                    </>
                                  )
                               })()}
                            </FixedStage>
                        </div>
                     </div>
                 );
              })}
           </div>
         </div>
       </div>
     );
  };

  const renderActionBar = () => {
     const mainConfig = liveState.settings?.outputs.find(o => o.id === 'main');
     const frozenState = liveState.frozenStates?.['main'];
     const isLocked = !!liveState.lockedOutputs?.['main'];
     
     let currentBgs = isLocked ? frozenState?.bgs : mainConfig?.backgrounds;
     if (!isLocked && liveState.globalBackground) {
        currentBgs = [{ id: 'g', type: liveState.globalBackground.type as any, url: liveState.globalBackground.url, layout: {x:0,y:0,width:1,height:1}, opacity: 100 }];
     }

     const isVideo = currentBgs?.some(bg => bg.type === 'video');

     return (
        <div className="h-12 bg-[#09090B] border-y border-white/5 flex items-center justify-between px-4 shrink-0 shadow-sm z-20 overflow-hidden relative">
           {/* Clear Controls */}
           <div className="flex items-center gap-2">
              <button onClick={toggleClearText} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${liveState.clearText ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.1)] hover:bg-orange-500/20' : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-transparent'}`} title="Clear Text"><EyeOff size={14} /><span>Clear Text</span></button>
              <button onClick={() => setGlobalBackground(null)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-transparent" title="Clear Media"><MonitorOff size={14} /><span>Clear Media</span></button>
              <button onClick={clearAll} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-red-500/20 text-red-500 border border-transparent hover:border-red-500/30 hover:shadow-[0_0_10px_rgba(239,68,68,0.15)]" title="Clear All"><X size={14} /><span>Clear All</span></button>
           </div>
           
           {/* Video Controls */}
           {isVideo ? (
               <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-1 px-2 text-neutral-300 shadow-inner">
                  <button onClick={togglePlay} className="hover:text-white hover:bg-white/20 p-1 rounded transition-colors text-blue-400">{isVideoPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
                  <button onClick={toggleMute} className="hover:text-white hover:bg-white/20 p-1 rounded transition-colors ml-1 cursor-pointer">{isVideoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                  <div className="text-xs text-white font-mono w-12 text-right ml-1 tracking-wider">{formatTime(videoCurrentTime)}</div>
                  <input type="range" min="0" step="0.1" max={videoDuration || 100} value={videoCurrentTime} onChange={handleSeek} className="w-48 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 mx-3" />
               </div>
           ) : (
               <div className="flex items-center h-full px-4 border border-dashed border-white/10 rounded-lg text-neutral-700 font-bold uppercase tracking-widest text-[10px]">
                  No Active Video
               </div>
           )}
           
           {/* Docking Controls */}
           <div className="flex items-center gap-2">
               <button onClick={() => setIsSidebarVisible(!isSidebarVisible)} className={`p-1.5 rounded-lg transition-colors border ${!isSidebarVisible ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-neutral-400 border-transparent hover:bg-white/10 hover:text-white'}`} title="Toggle Sidebars">
                   {isSidebarVisible ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
               </button>
           </div>
        </div>
     );
  };

  return (
    <div className="flex flex-col h-screen bg-black text-neutral-200 overflow-hidden font-sans select-none relative">
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={globalSettings} onSave={setGlobalSettings} detectedScreens={detectedScreens} primaryScreenLabel={primaryScreenLabel} />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-3 animate-in slide-in-from-bottom-5">
           <CheckCircle2 size={18} />
           <span className="font-bold tracking-wide text-sm">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3 w-64">
          <div className="bg-blue-600 p-1.5 rounded-md shadow-lg flex items-center justify-center">
             <Layers size={18} className="text-white" />
          </div>
          <span className="font-black text-white tracking-[0.2em] text-xs">FLOWSHOW</span>
        </div>

        {/* MASTER PRESENT TOGGLE */}
        <button
           onClick={togglePresenting}
           className={`flex items-center gap-2 px-8 py-2 rounded-full text-[10px] font-black tracking-widest transition-all ${
              liveState.isPresenting
              ? 'bg-red-500/10 text-red-500 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:bg-red-500/20'
              : 'bg-white/5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20'
           }`}
        >
           <MonitorPlay size={14} />
           {liveState.isPresenting ? 'STOP BROADCAST' : 'GO LIVE'}
        </button>

        <div className="w-64 flex justify-end"></div>
      </header>
      
      {/* MONITOR BRIDGE (A/B View & Stacks) */}
      {renderMonitorBridge()}

      {/* ACTION BAR */}
      {renderActionBar()}

      {/* 3-COLUMN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* PRIMARY SIDEBAR (NAVIGATION) */}
        {isSidebarVisible && (
          <div className="w-16 bg-[#09090B] border-r border-white/5 flex flex-col items-center py-4 gap-4 shrink-0 z-20">
            <div className="flex flex-col gap-2 w-full px-2">
              <button onClick={() => setActiveTab('songs')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'songs' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:bg-white/5 hover:text-white'}`} title="Songs"><Music size={20} strokeWidth={activeTab === 'songs' ? 2.5 : 2} /></button>
              <button onClick={() => setActiveTab('bibles')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'bibles' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:bg-white/5 hover:text-white'}`} title="Bibles"><BookOpen size={20} strokeWidth={activeTab === 'bibles' ? 2.5 : 2} /></button>
              <button onClick={() => setActiveTab('media')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'media' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:bg-white/5 hover:text-white'}`} title="Media"><ImageIcon size={20} strokeWidth={activeTab === 'media' ? 2.5 : 2} /></button>
              <div className="w-8 h-px bg-white/5 mx-auto my-2"></div>
              <button onClick={() => setActiveTab('audio')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'audio' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:bg-white/5 hover:text-white'}`} title="Live Transcriber"><Mic size={20} strokeWidth={activeTab === 'audio' ? 2.5 : 2} /></button>
            </div>
            <div className="mt-auto w-full px-2">
              <button onClick={() => setIsSettingsModalOpen(true)} className="w-full aspect-square flex justify-center items-center rounded-xl text-neutral-500 hover:bg-white/5 hover:text-white transition-all" title="Settings"><Settings size={20} /></button>
            </div>
          </div>
        )}

        {/* SECONDARY SIDEBAR (LISTS) */}
        {(isSidebarVisible && activeTab !== 'media' && activeTab !== 'audio') && (
           <div className="w-48 xl:w-56 bg-[#121214] border-r border-white/5 shrink-0 flex flex-col z-10 transition-all">
              {renderSidebarList()}
           </div>
        )}

        {/* CENTER WORKSPACE */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090B] relative">
           <div className="flex-1 overflow-hidden relative bg-[#09090B]">
              {renderCenterWorkspace()}
           </div>
        </div>

      </div>

      {/* CONTEXT MENUS */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#18181B] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1.5 w-48 backdrop-blur-xl" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'slide' ? (
             <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={(e) => { e.stopPropagation(); setIsEditingSong(true); setEditingSlideIndex(contextMenu.id as number); setContextMenu(null); }}><Edit2 size={14}/> Edit</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={(e) => { e.stopPropagation(); handleDuplicateSlide(contextMenu.id as number); setContextMenu(null); }}><Copy size={14}/> Duplicate</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={(e) => { e.stopPropagation(); handleSplitSlide(contextMenu.id as number); setContextMenu(null); }}><Split size={14}/> Split</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={(e) => { e.stopPropagation(); handleDeleteSlide(contextMenu.id as number); setContextMenu(null); }}><Trash size={14}/> Delete</button>
             </>
          ) : (
            <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={(e) => {
                   e.stopPropagation();
                   if (contextMenu.type === 'song') {
                        const song = songsList.find(s => s.id === contextMenu.id);
                        if (song) setRenamePrompt({ type: 'song', id: song.id, currentName: song.title });
                   } else if (contextMenu.type === 'bible') {
                        const b = bibleList.find(b => b.id === contextMenu.id);
                        if (b) setRenamePrompt({ type: 'bible', id: b.id, currentName: b.name });
                   }
                   setContextMenu(null);
                 }}><Edit2 size={14}/> Rename {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={(e) => {
                   e.stopPropagation();
                   if (contextMenu.type === 'song') deleteSong(contextMenu.id); else if (contextMenu.type === 'bible') handleDeleteBible(contextMenu.id as string);
                   setContextMenu(null);
                 }}><Trash size={14}/> Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
            </>
          )}
        </div>
      )}

      {renamePrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#121214] border border-white/10 p-6 rounded-xl w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Rename {renamePrompt.type === 'song' ? 'Song' : 'Bible'}</h3>
            <input 
              autoFocus
              type="text" 
              defaultValue={renamePrompt.currentName} 
              className="w-full bg-[#09090B] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 mb-6"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                   const val = (e.target as HTMLInputElement).value;
                   if (val && val.trim()) {
                      const newName = val.trim();
                      if (renamePrompt.type === 'song') {
                         setSongsList(prev => prev.map(s => s.id === renamePrompt.id ? { ...s, title: newName } : s));
                      } else if (renamePrompt.type === 'bible') {
                         getBible(renamePrompt.id).then(bibleData => { 
                             if (bibleData) { 
                                 const updatedBibleData = { ...bibleData, name: newName };
                                 saveBible(updatedBibleData).then(() => { 
                                     getBibleList().then(list => setBibleList(list)); 
                                     if (activeBibleId === renamePrompt.id) setActiveBibleData(updatedBibleData); 
                                     window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Bible renamed successfully.' }));
                                 }); 
                             }
                         }); 
                      }
                      setRenamePrompt(null);
                   }
                } else if (e.key === 'Escape') {
                   setRenamePrompt(null);
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRenamePrompt(null)} className="px-5 py-2.5 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button 
                onClick={(e) => {
                   const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                   const val = input.value;
                   if (val && val.trim()) {
                      const newName = val.trim();
                      if (renamePrompt.type === 'song') {
                         setSongsList(prev => prev.map(s => s.id === renamePrompt.id ? { ...s, title: newName } : s));
                      } else if (renamePrompt.type === 'bible') {
                         getBible(renamePrompt.id).then(bibleData => { 
                             if (bibleData) { 
                                 const updatedBibleData = { ...bibleData, name: newName };
                                 saveBible(updatedBibleData).then(() => { 
                                     getBibleList().then(list => setBibleList(list)); 
                                     if (activeBibleId === renamePrompt.id) setActiveBibleData(updatedBibleData); 
                                     window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Bible renamed successfully.' }));
                                 }); 
                             }
                         }); 
                      }
                      setRenamePrompt(null);
                   }
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
               >
                 Save
               </button>
            </div>
          </div>
        </div>
      )}

      <AddSongModal isOpen={isAddSongModalOpen} onClose={() => setIsAddSongModalOpen(false)} onAddSong={(newSong) => { setSongsList(prev => [...prev, newSong]); setActiveTab('songs'); setActiveItemIndex(songsList.length); }} />
    </div>
  );
}

function ProjectorView() {
  const { outputId = 'main' } = useParams();
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });
  
  const projectorVideoRef = useRef<HTMLVideoElement>(null);
  const lockedRef = useRef(false);

  useEffect(() => {
    // Attempt Auto-Fullscreen in browser (Electron handles this natively via skipTaskbar/fullscreen)
    if (!window.electronAPI) {
        const attemptFullscreen = () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        };
        attemptFullscreen();
        window.addEventListener('click', attemptFullscreen, { once: true });
    }
  }, []);

  useEffect(() => {
    lockedRef.current = !!liveState.lockedOutputs?.[outputId];
  }, [liveState.lockedOutputs, outputId]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'CLOSE_WINDOW') {
          window.close();
          return;
      }
      
      if (event.data?.type === 'VIDEO_CMD') {
        if (lockedRef.current) return; 
        
        const { command, value } = event.data;
        if (projectorVideoRef.current) {
           if (command === 'play') projectorVideoRef.current.play().catch(console.error);
           else if (command === 'pause') projectorVideoRef.current.pause();
           else if (command === 'mute') projectorVideoRef.current.muted = value;
           else if (command === 'seek') projectorVideoRef.current.currentTime = value;
        }
      } else if (event.data && !event.data.type?.startsWith('REQUEST_')) {
         
         setLiveState(prev => {
             const incoming = event.data;
             const isNowLocked = incoming.lockedOutputs?.[outputId];

             if (isNowLocked) {
                 return {
                     ...incoming,
                     slide: prev.slide,
                     globalBackground: prev.globalBackground,
                     clearText: prev.clearText,
                     clearedOutputs: {
                         ...incoming.clearedOutputs,
                         [outputId]: prev.clearedOutputs?.[outputId] 
                     }
                 };
             }
             return incoming;
         });

         if (!lockedRef.current && event.data.videoInitState && projectorVideoRef.current) {
             projectorVideoRef.current.currentTime = event.data.videoInitState.time;
             projectorVideoRef.current.muted = event.data.videoInitState.muted;
             if (event.data.videoInitState.playing) projectorVideoRef.current.play().catch(console.error);
             else projectorVideoRef.current.pause();
         }
      }
    };
    return () => channel.close();
  }, [outputId]);

  const outputConfig = liveState.settings?.outputs.find(o => o.id === outputId);
  const isCleared = !!liveState.clearedOutputs?.[outputId];
  const isLocked = !!liveState.lockedOutputs?.[outputId];
  const frozenState = liveState.frozenStates?.[outputId];
  
  let activeBackgrounds = isLocked ? (frozenState?.bgs || []) : (outputConfig?.backgrounds || []);
  if (!isLocked && outputId === 'main' && liveState.globalBackground) {
      activeBackgrounds = [{ id: 'global', type: liveState.globalBackground.type as any, url: liveState.globalBackground.url, layout: { x: 0, y: 0, width: 1, height: 1 }, opacity: 100 }];
  }

  const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
  const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

  // Stage clear only removes text, leaves background
  const hideBg = isCleared && outputId !== 'stage';
  const hideText = isCleared;

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.warn('Fullscreen request failed:', err));
    } else {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
    }
  };

  return (
    <>
    <style>{`html, body, #root { background-color: transparent !important; }`}</style>
    <div onDoubleClick={toggleFullScreen} className="w-screen h-screen bg-transparent flex flex-col items-center justify-center overflow-hidden relative cursor-none select-none">
      <div className={`w-full h-full transition-opacity duration-700 ease-in-out ${liveState.isPresenting ? 'opacity-100' : 'opacity-0'}`}>
        <FixedStage className="w-full h-full relative">
          
          {!hideBg && activeBackgrounds.map((bg, idx) => (
              <div key={bg.id} style={{ position: 'absolute', zIndex: 10 + idx, left: `${(bg.layout?.x || 0)*100}%`, top: `${(bg.layout?.y || 0)*100}%`, width: `${(bg.layout?.width || 1)*100}%`, height: `${(bg.layout?.height || 1)*100}%`, opacity: (bg.opacity ?? 100) / 100, pointerEvents: 'none' }}>
                  {bg.type === 'color' && <div className="w-full h-full" style={{ backgroundColor: bg.color || '#000' }} />}
                  {bg.type === 'video' && <video ref={projectorVideoRef} src={bg.url} className="w-full h-full object-cover" autoPlay loop playsInline />}
                  {bg.type === 'image' && <img src={bg.url} className="w-full h-full object-cover" alt="bg" />}
              </div>
          ))}
          
          {!hideText && !displayClearText && displaySlide && (
             <div style={{ position: 'absolute', zIndex: 100, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, outputConfig)} className="relative w-full h-full animate-in fade-in duration-300" />
             </div>
          )}

        </FixedStage>
      </div>
    </div>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ControlPanel />} />
        <Route path="/projector/:outputId" element={<ProjectorView />} />
        <Route path="/projector" element={<ProjectorView />} /> 
      </Routes>
    </HashRouter>
  );
}