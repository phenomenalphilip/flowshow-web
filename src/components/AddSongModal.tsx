import React, { useState } from 'react';
import { X, Search, Activity } from 'lucide-react';
import { SlideDefinition } from '../App';

type AddSongModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: { id: string, title: string, slides: SlideDefinition[] }) => void;
};

export function AddSongModal({ isOpen, onClose, onAddSong }: AddSongModalProps) {
  const [title, setTitle] = useState('');
  const [method, setMethod] = useState<'quick' | 'web'>('quick');
  const [lyrics, setLyrics] = useState('');
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  
  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSelectedResult(null);
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  const processLyricsToSlides = (text: string) => {
    // Normalize newlines to \n, remove carriage returns
    const normalizedText = text.replace(/\r\n/g, '\n');
    
    // Split lyrics by empty lines to find stanzas
    const stanzas = normalizedText.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    
    const slides: SlideDefinition[] = [];
    let globalSlideIndex = 0;
    
    for (const stanza of stanzas) {
      // Split stanza into lines
      const rawLines = stanza.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Keep headers like [Chorus] out of the final slides if they are the only thing
      // Better yet, just filter out lines that start with [ and end with ]
      const lines = rawLines.filter(l => !(l.startsWith('[') && l.endsWith(']')));
      
      if (lines.length === 0) continue;
      
      for (let i = 0; i < lines.length; i += linesPerSlide) {
        const chunk = lines.slice(i, i + linesPerSlide);
        slides.push({
          id: `slide-${Date.now()}-${globalSlideIndex++}`,
          text: chunk.join('\n'),
          type: 'lyrics'
        });
      }
    }
    
    return slides;
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    let textToProcess = '';
    
    if (method === 'quick') {
      textToProcess = lyrics;
    } else {
      if (!selectedResult || !selectedResult.plainLyrics) {
         // Fallback if they didn't select or song has no lyrics
         return;
      }
      textToProcess = selectedResult.plainLyrics;
    }
    
    const newSong = {
      id: `song-${Date.now()}`,
      title: title.trim(),
      slides: processLyricsToSlides(textToProcess)
    };
    
    onAddSong(newSong);
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setLyrics('');
    setMethod('quick');
    setLinesPerSlide(2);
    setSearchResults([]);
    setSelectedResult(null);
    setIsSearching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#09090B] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#09090B]">
          <h2 className="text-lg font-bold text-white tracking-tight">Add New Song</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Song Title</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amazing Grace"
              className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-medium"
            />
          </div>

          {/* Methods */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Input Method</label>
            <div className="flex bg-[#030303] rounded-lg p-1.5 border border-white/5 shadow-inner">
              <button 
                onClick={() => setMethod('quick')}
                className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${method === 'quick' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
              >
                Quick Lyrics
              </button>
              <button 
                onClick={() => setMethod('web')}
                className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${method === 'web' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
              >
                Web Search
              </button>
            </div>
          </div>

          {/* Lines per slide */}
          <div className="flex items-center space-x-4 bg-[#030303] rounded-xl p-4 border border-white/5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex-1">Max Lines Per Slide</label>
            <div className="flex items-center space-x-3">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={linesPerSlide} 
                onChange={(e) => setLinesPerSlide(parseInt(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-sm font-bold bg-[#121214] px-3 py-1.5 rounded-lg border border-white/5 min-w-[36px] text-center text-white">
                {linesPerSlide}
              </span>
            </div>
          </div>

          {/* Dynamic Content area */}
          {method === 'quick' ? (
            <div className="flex flex-col flex-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Lyrics</label>
              <textarea 
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste lyrics here..."
                className="w-full h-48 bg-white/5 border border-white/10 rounded-lg text-sm px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all resize-none leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex flex-col space-y-4">
              <button 
                onClick={handleSearch}
                disabled={!title.trim() || isSearching}
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-sm font-bold text-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div> : <Search size={16} />}
                {isSearching ? 'Searching...' : 'Search Setlist / SongSelect'}
              </button>

              {searchResults.length > 0 && (
                <div className="space-y-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Results</label>
                  {searchResults.map(result => (
                    <div 
                      key={result.id}
                      onClick={() => setSelectedResult(result)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedResult?.id === result.id ? 'bg-blue-600/20 border-blue-500/50 shadow-inner' : 'bg-[#030303] border-white/5 hover:border-white/20 hover:bg-white/5 shadow-sm'}`}
                    >
                      <div className="font-bold text-sm text-white tracking-tight truncate">{result.name}</div>
                      <div className="text-xs font-medium text-neutral-400 mt-1.5 truncate">{result.artistName} {result.albumName ? `• ${result.albumName}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedResult && !selectedResult.plainLyrics && (
                <div className="text-xs text-red-400 font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                  This song does not have lyrics available.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-[#09090B] flex justify-end gap-3">
          <button 
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={
              !title.trim() || 
              (method === 'quick' && !lyrics.trim()) || 
              (method === 'web' && (!selectedResult || !selectedResult.plainLyrics))
            }
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
          >
            Add Song
          </button>
        </div>
      </div>
    </div>
  );
}
