import React, { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { FolderPlus, Image as ImageIcon, Video, Trash, Folder, ChevronRight, ArrowUp } from 'lucide-react';

const MOCK_MEDIA = [
  { id: 'm1', url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?q=80&w=1000&auto=format&fit=crop', name: 'Blue Abstract', type: 'image' },
  { id: 'm2', url: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=1000&auto=format&fit=crop', name: 'Dark Particles', type: 'image' },
  { id: 'm3', url: 'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=1000&auto=format&fit=crop', name: 'Space Stars', type: 'image' },
];

export type MediaItem = {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video';
  path?: string;
};

type VirtualDir = {
  name: string;
  children: Map<string, VirtualDir>;
  files: File[];
};

type DisplayItem = 
  | { kind: 'directory'; name: string; handle?: any; virtualDir?: VirtualDir }
  | { kind: 'file'; name: string; media: MediaItem };

const URL_CACHE = new Map<string, string>();
function getCachedObjectURL(id: string, file: File) {
    if (!URL_CACHE.has(id)) {
        URL_CACHE.set(id, URL.createObjectURL(file));
    }
    return URL_CACHE.get(id)!;
}

let GLOBAL_MEDIA_LOADED = false;
let GLOBAL_TOP_LEVEL_FOLDERS: any[] = [];
let GLOBAL_UNAUTHORIZED_FOLDERS: any[] = [];
let GLOBAL_FALLBACK_SOURCES: {name: string, root: VirtualDir}[] = [];

export function MediaLibrary({ onSelectBackground }: { onSelectBackground: (url: string, type: 'image' | 'video') => void }) {
   const [topLevelFolders, setTopLevelFolders] = useState<any[]>(GLOBAL_TOP_LEVEL_FOLDERS);
   const [fallbackSources, setFallbackSources] = useState<{name: string, root: VirtualDir}[]>(GLOBAL_FALLBACK_SOURCES);
   
   const [activeSourceId, setActiveSourceId] = useState<string>('demo');
   const [pathStack, setPathStack] = useState<{name: string, handle?: any, virtualDir?: VirtualDir}[]>([{ name: 'Demo Media' }]);
   const [currentDisplayItems, setCurrentDisplayItems] = useState<DisplayItem[]>(
       MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem }))
   );
   const [isLoadingDir, setIsLoadingDir] = useState(false);
   const [unauthorizedFolders, setUnauthorizedFolders] = useState<any[]>(GLOBAL_UNAUTHORIZED_FOLDERS);

   useEffect(() => {
      if (GLOBAL_MEDIA_LOADED) return;
      get('media_folders').then(handles => {
         if (handles && Array.isArray(handles)) {
            GLOBAL_TOP_LEVEL_FOLDERS = handles;
            setTopLevelFolders(handles);
            checkPermissions(handles).then(unauthorized => {
                GLOBAL_UNAUTHORIZED_FOLDERS = unauthorized;
                setUnauthorizedFolders(unauthorized);
                GLOBAL_MEDIA_LOADED = true;
            });
         } else {
            GLOBAL_MEDIA_LOADED = true;
         }
      });
   }, []);

   const checkPermissions = async (handles: any[]) => {
      const unauthorized = [];
      for (const h of handles) {
         if (await h.queryPermission({ mode: 'read' }) !== 'granted') {
             unauthorized.push(h);
         }
      }
      return unauthorized;
   };

   const requestFolderPermission = async (handle: any) => {
      if (await handle.requestPermission({ mode: 'read' }) === 'granted') {
          const updated = unauthorizedFolders.filter(h => h !== handle);
          GLOBAL_UNAUTHORIZED_FOLDERS = updated;
          setUnauthorizedFolders(updated);
          // If this was the active source, reload it
          if (activeSourceId === handle.name) {
              selectSource(handle.name);
          }
      }
   }

   const removeFolder = async (handleName: string) => {
      const remaining = topLevelFolders.filter(h => h.name !== handleName);
      GLOBAL_TOP_LEVEL_FOLDERS = remaining;
      setTopLevelFolders(remaining);
      await set('media_folders', remaining);
      const remainingUnauth = unauthorizedFolders.filter(h => h.name !== handleName);
      GLOBAL_UNAUTHORIZED_FOLDERS = remainingUnauth;
      setUnauthorizedFolders(remainingUnauth);
      if (activeSourceId === handleName) {
          selectSource('demo');
      }
   }

   const removeFallbackFolder = (name: string) => {
       const remaining = fallbackSources.filter(f => f.name !== name);
       GLOBAL_FALLBACK_SOURCES = remaining;
       setFallbackSources(remaining);
       if (activeSourceId === name) {
           selectSource('demo');
       }
   };

   const loadDirectoryLevel = async (handle: any, virtualDir?: VirtualDir) => {
       setIsLoadingDir(true);
       const items: DisplayItem[] = [];

       try {
           if (handle) {
               // Check permission just in case
               if (await handle.queryPermission({ mode: 'read' }) === 'granted') {
                   for await (const entry of handle.values()) {
                       if (entry.kind === 'directory') {
                           items.push({ kind: 'directory', name: entry.name, handle: entry });
                       } else if (entry.kind === 'file') {
                           if (entry.name.match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i)) {
                               const file = await entry.getFile();
                               const type = file.type.startsWith('video/') || entry.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                               items.push({
                                   kind: 'file',
                                   name: entry.name,
                                   media: {
                                       id: entry.name + file.lastModified,
                                       name: entry.name,
                                       type: type as 'image'|'video',
                                       url: getCachedObjectURL(entry.name + file.lastModified, file)
                                   }
                               });
                           }
                       }
                   }
               }
           } else if (virtualDir) {
               virtualDir.children.forEach(child => {
                   items.push({ kind: 'directory', name: child.name, virtualDir: child });
               });
               virtualDir.files.forEach(file => {
                   const type = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                   items.push({
                       kind: 'file',
                       name: file.name,
                       media: {
                           id: file.name + file.lastModified,
                           name: file.name,
                           type: type as 'image'|'video',
                           url: getCachedObjectURL(file.name + file.lastModified, file)
                       }
                   });
               });
           }
       } catch (e) {
           console.error("Error loading directory", e);
       }

       // Sort items: directories first, then files
       items.sort((a, b) => {
           if (a.kind === b.kind) return a.name.localeCompare(b.name);
           return a.kind === 'directory' ? -1 : 1;
       });

       setCurrentDisplayItems(items);
       setIsLoadingDir(false);
   };

   const selectSource = (sourceId: string) => {
       setActiveSourceId(sourceId);
       
       if (sourceId === 'demo') {
           setPathStack([{ name: 'Demo Media' }]);
           setCurrentDisplayItems(MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem })));
       } else {
           const nativeFolder = topLevelFolders.find(f => f.name === sourceId);
           if (nativeFolder) {
               setPathStack([{ name: nativeFolder.name, handle: nativeFolder }]);
               loadDirectoryLevel(nativeFolder);
               return;
           }
           const virtualFolder = fallbackSources.find(f => f.name === sourceId);
           if (virtualFolder) {
               setPathStack([{ name: virtualFolder.name, virtualDir: virtualFolder.root }]);
               loadDirectoryLevel(null, virtualFolder.root);
               return;
           }
       }
   }

   const enterFolder = (item: DisplayItem) => {
       if (item.kind !== 'directory') return;
       const newStack = [...pathStack, { name: item.name, handle: item.handle, virtualDir: item.virtualDir }];
       setPathStack(newStack);
       loadDirectoryLevel(item.handle, item.virtualDir);
   }

   const goUp = () => {
       if (pathStack.length <= 1) return;
       const newStack = pathStack.slice(0, -1);
       setPathStack(newStack);
       const parent = newStack[newStack.length - 1];
       if (activeSourceId === 'demo') {
           // Not applicable
       } else {
           loadDirectoryLevel(parent.handle, parent.virtualDir);
       }
   };

   const handleAddFolder = async () => {
      try {
         const handle = await (window as any).showDirectoryPicker({
            id: 'media_folder',
            mode: 'read'
         });
         
         const newFolders = [...topLevelFolders.filter(f => f.name !== handle.name), handle];
         GLOBAL_TOP_LEVEL_FOLDERS = newFolders;
         setTopLevelFolders(newFolders);
         await set('media_folders', newFolders);
         selectSource(handle.name);
      } catch (err) {
         console.log('User cancelled or error', err);
      }
   };
   
   const handleFallbackFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      
      const rootMap = new Map<string, VirtualDir>();
      
      for (let i=0; i<files.length; i++) {
          const file = files[i];
          if (!file.name.match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i)) continue;
          
          const parts = file.webkitRelativePath.split('/');
          if (parts.length === 0) continue;
          
          const rootName = parts[0];
          if (!rootMap.has(rootName)) {
              rootMap.set(rootName, { name: rootName, children: new Map(), files: [] });
          }
          
          let current = rootMap.get(rootName)!;
          for (let j=1; j<parts.length - 1; j++) {
              const part = parts[j];
              if (!current.children.has(part)) {
                  current.children.set(part, { name: part, children: new Map(), files: [] });
              }
              current = current.children.get(part)!;
          }
          
          current.files.push(file);
      }
      
      const newSources = Array.from(rootMap.values()).map(v => ({ name: v.name, root: v }));
      setFallbackSources(prev => {
         const next = [...prev, ...newSources];
         GLOBAL_FALLBACK_SOURCES = next;
         return next;
      });
      
      if (newSources.length > 0) {
          selectSource(newSources[0].name);
      }
   };

   let isIframe = false;
   try {
     isIframe = window.self !== window.top;
   } catch (e) {
     isIframe = true;
   }
   // AI Studio Preview might run in a same-origin iframe internally but lack file system API permissions due to missing Feature-Policy.
   const isAIStudioPreview = window.location.hostname.includes('webcontainer') || window.location.hostname.includes('preview');
   const canUseFileAccessApi = 'showDirectoryPicker' in window && !isIframe && !isAIStudioPreview;

   return (
      <div className="flex h-full bg-[#030303] border border-white/5 rounded-xl overflow-hidden min-h-0 shadow-lg relative">
         {/* Sidebar */}
         <div className="w-48 md:w-56 border-r border-white/5 bg-[#09090B] flex flex-col shrink-0 h-full min-h-0">
             <div className="p-4 border-b border-white/5 bg-[#09090B]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                   <ImageIcon size={16} className="text-blue-500" />
                   Media Library
                </h3>
             </div>
             
             <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2">Built-in</div>
                   <button 
                       onClick={() => selectSource('demo')}
                       className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2
                           ${activeSourceId === 'demo' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border border-transparent'}
                       `}
                   >
                       <ImageIcon size={16} /> 
                       Demo Media
                   </button>
                </div>
                
                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2 flex justify-between items-center">
                       <span>Local Folders</span>
                   </div>
                   
                   {topLevelFolders.map(f => (
                       <div key={f.name} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)}>
                               {unauthorizedFolders.includes(f) ? (
                                   <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 shadow-[0_0_8px_rgba(249,115,22,0.6)]" title="Needs Permission" />
                               ) : <Folder size={16} className="shrink-0 text-blue-400" />}
                               <span className="truncate">{f.name}</span>
                           </div>
                           
                           {unauthorizedFolders.includes(f) ? (
                               <button onClick={() => requestFolderPermission(f)} className="text-[10px] font-bold bg-orange-500/20 text-orange-400 px-2 py-1 rounded border border-orange-500/30 hover:bg-orange-500/30 shrink-0 ml-2 uppercase tracking-wide">Grant</button>
                           ) : (
                               <button onClick={() => removeFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                           )}
                       </div>
                   ))}
                   
                   {fallbackSources.map(f => (
                       <div key={f.name} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)}>
                               <Folder size={16} className="shrink-0 text-blue-400" />
                               <span className="truncate">{f.name}</span>
                           </div>
                           <button onClick={() => removeFallbackFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                       </div>
                   ))}
                </div>
             </div>
             
             <div className="p-4 border-t border-white/5 bg-[#09090B] shrink-0 mt-auto relative z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
                  {canUseFileAccessApi ? (
                    <button 
                        onClick={handleAddFolder}
                        className="flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white font-medium transition-all shadow-sm"
                    >
                        <FolderPlus size={16} />
                        Add Native Folder
                    </button>
                  ) : (
                    <label className="flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium transition-all cursor-pointer shadow-sm relative overflow-hidden">
                        <FolderPlus size={16} />
                        Add Local Folder
                        <input 
                            type="file" 
                            {...({ webkitdirectory: "true", directory: "true" } as any)}
                            multiple 
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                            onChange={handleFallbackFolderSelect}
                        />
                    </label>
                  )}
             </div>
         </div>

         {/* Main View Area */}
         <div className="flex-1 flex flex-col min-w-0 bg-[#030303]">
            {/* Breadcrumb Path */}
            <div className="h-14 border-b border-white/5 flex items-center px-6 bg-[#09090B] shrink-0 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {pathStack.length > 1 && (
                        <button 
                           onClick={goUp} 
                           className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-all mr-2"
                           title="Go Up"
                        >
                           <ArrowUp size={16} />
                        </button>
                    )}
                    {pathStack.map((p, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={14} className="text-neutral-600 mx-1" />}
                            <span className={`text-sm ${i === pathStack.length - 1 ? 'text-white font-medium' : 'text-neutral-500'}`}>
                                {p.name}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
            </div>
            
            {/* Folder Contents */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
               {isLoadingDir ? (
                   <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-500 animate-pulse text-sm">
                       <Folder size={32} className="text-neutral-700 opacity-50" />
                       Reading directory...
                   </div>
               ) : currentDisplayItems.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-full text-neutral-600 text-sm italic gap-4">
                       <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                           <Folder size={24} className="text-neutral-700" />
                       </div>
                       Folder is empty
                   </div>
               ) : (
                   <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                      {currentDisplayItems.map((item, idx) => (
                         item.kind === 'directory' ? (
                            <div 
                               key={`dir-${idx}`}
                               onClick={() => enterFolder(item)} 
                               className="cursor-pointer bg-[#121214] hover:bg-[#18181A] border border-white/5 hover:border-blue-500/50 rounded-xl p-6 flex flex-col items-center justify-center text-center aspect-video gap-4 transition-all group shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                            >
                               <div className="bg-blue-500/10 p-4 rounded-full group-hover:scale-110 transition-transform">
                                   <Folder size={32} className="text-blue-500 shadow-sm" />
                               </div>
                               <span className="text-sm font-medium text-neutral-300 group-hover:text-white truncate w-full px-2" title={item.name}>
                                   {item.name}
                               </span>
                            </div>
                         ) : (
                            <MediaCard 
                               key={`file-${idx}`} 
                               media={item.media!} 
                               onSelect={() => onSelectBackground(item.media!.url, item.media!.type)} 
                            />
                         )
                      ))}
                   </div>
               )}
            </div>
         </div>
      </div>
   );
}

function MediaCard({ media, onSelect }: { media: MediaItem, onSelect: () => void, key?: React.Key }) {
   return (
      <div 
         onClick={onSelect}
         className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group border border-white/5 hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-[#121214] transition-all shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
         title={media.name}
      >
         {media.type === 'video' ? (
            <video 
              src={media.url} 
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              muted loop playsInline
              onMouseOver={e => (e.target as HTMLVideoElement).play()}
              onMouseOut={e => {
                  const v = (e.target as HTMLVideoElement);
                  v.pause();
                  v.currentTime = 0;
              }}
            />
         ) : (
            <img src={media.url} alt={media.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
         )}
         
         <div className="absolute top-2 left-2 bg-black/60 p-1.5 rounded-lg text-white backdrop-blur-md pointer-events-none shadow-sm z-10 border border-white/10">
            {media.type === 'video' ? <Video size={14} /> : <ImageIcon size={14} />}
         </div>
         
         <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-3 px-4 pointer-events-none translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <div className="text-xs text-neutral-200 truncate font-semibold drop-shadow-md">
               {media.name}
            </div>
         </div>
      </div>
   );
}
