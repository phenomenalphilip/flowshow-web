import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, BookOpen, Activity, AlertCircle, Sparkles, Check, ChevronRight, Settings, X, Send } from "lucide-react";
import { parseBibleReference, normalizeTranscript } from "../lib/parser";
import { detectVerseFromContext } from "../lib/ai";
import { FreeshowConfig, defaultFreeshowConfig, sendToFreeshow } from "../lib/freeshow";

interface AudioModuleProps {
  onVerseDetected: (reference: any) => void;
}

export function AudioModule({ onVerseDetected }: AudioModuleProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastDetected, setLastDetected] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  // FreeShow settings
  const [config, setConfig] = useState<FreeshowConfig>(defaultFreeshowConfig);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Load config from local storage
  useEffect(() => {
    const saved = localStorage.getItem('freeshow_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
          if (parsed.url === 'http://localhost:5506' || parsed.url === 'http://127.0.0.1:8080/api/action') {
             saveConfig(defaultFreeshowConfig);
          } else {
             setConfig(parsed);
          }
      } catch (e) {
        console.error("Failed to parse saved config");
      }
    }
  }, []);

  // Save config to local storage
  const saveConfig = (newConfig: FreeshowConfig) => {
    setConfig(newConfig);
    localStorage.setItem('freeshow_config', JSON.stringify(newConfig));
  };
  
  // We use a ref to store the recognition instance so we can stop it
  const recognitionRef = useRef<any>(null);
  const lastResolvedMatchIndexRef = useRef<number>(0);
  const transcriptRef = useRef(transcript);
  const latestDetectedJSONRef = useRef<string | null>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const shouldBeListeningRef = useRef<boolean>(false);

  // Keep transcriptRef up to date across renders for setInterval
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Hook to send to FreeShow when lastDetected changes
  useEffect(() => {
    if (lastDetected && config.enabled) {
      setIntegrationStatus('sending');
      sendToFreeshow(config, lastDetected.reference)
        .then(() => setIntegrationStatus('success'))
        .catch(() => setIntegrationStatus('error'));
    }
  }, [lastDetected, config]);

  useEffect(() => {
    // Stage 3 Contextual Buffering & AI trigger
    if (!isListening) return;
    
    let isFetching = false;
    
    const interval = setInterval(async () => {
      if (isFetching) return;
      
      const currentTranscript = transcriptRef.current;
      if (!currentTranscript) return;

      const startIndex = lastResolvedMatchIndexRef.current || 0;
      const unprocessedTranscript = currentTranscript.substring(startIndex);
      
      const words = unprocessedTranscript.split(/\s+/).filter(Boolean);
      const recentWords = words.slice(-30).join(" ");
      
      if (recentWords.length > 20) {
        const aiCheckPoint = currentTranscript.length;
        
        isFetching = true;
        setIsAiProcessing(true);
        
        try {
          const aiResult = await detectVerseFromContext(recentWords);
          
          if (aiResult) {
            if (lastResolvedMatchIndexRef.current > aiCheckPoint) {
              return;
            }

            if (aiResult.confidence && aiResult.confidence >= 75) {
              const stringified = JSON.stringify(aiResult.reference);
              if (stringified !== latestDetectedJSONRef.current) {
                latestDetectedJSONRef.current = stringified;
                setLastDetected(aiResult);
                onVerseDetected(aiResult.reference);
                lastResolvedMatchIndexRef.current = Math.max(lastResolvedMatchIndexRef.current, aiCheckPoint);
              }
            } else {
              setSuggestions((prev) => {
                const exists = prev.some(
                  (s) => JSON.stringify(s.reference) === JSON.stringify(aiResult.reference)
                );
                if (exists) return prev;
                return [aiResult, ...prev].slice(0, 5);
              });
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsAiProcessing(false);
          isFetching = false;
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isListening, onVerseDetected]);

  useEffect(() => {
    // Setup SpeechRecognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Speech Recognition not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMsg(null);
    };
    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        accumulatedTranscriptRef.current = transcriptRef.current;
        try {
          recognition.start();
        } catch (e) {
          console.error("Auto-restart error", e);
          setIsListening(false);
          shouldBeListeningRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Ignore no-speech error, onend will restart it if needed
        return;
      }
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldBeListeningRef.current = false;
        setIsListening(false);
        setErrorMsg(`Browser blocked microphone. Please ensure permissions are granted in your browser settings, then refresh.`);
      }
    };
    
    recognition.onresult = (event: any) => {
      let sessionTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        sessionTranscript += event.results[i][0].transcript;
      }
      
      const fullTranscript = accumulatedTranscriptRef.current + " " + sessionTranscript;
      setTranscript(fullTranscript);
      
      const detectedVerse = parseBibleReference(fullTranscript);
      if (detectedVerse) {
        const stringified = JSON.stringify(detectedVerse.reference);
        if (stringified !== latestDetectedJSONRef.current) {
           latestDetectedJSONRef.current = stringified;
           setLastDetected(detectedVerse);
           onVerseDetected(detectedVerse.reference);
           lastResolvedMatchIndexRef.current = fullTranscript.length;
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [onVerseDetected]);

  const toggleListening = async () => {
    if (isListening) {
      shouldBeListeningRef.current = false;
      recognitionRef.current?.stop();
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        }

        shouldBeListeningRef.current = true;
        accumulatedTranscriptRef.current = "";
        setErrorMsg(null);
        setTranscript("");
        setLastDetected(null);
        setSuggestions([]);
        lastResolvedMatchIndexRef.current = 0;
        
        recognitionRef.current?.start();
      } catch (err: any) {
        console.error("Microphone error:", err);
        setErrorMsg(`Microphone access blocked. Please allow microphone access.`);
      }
    }
  };

  const clearAndRestart = () => {
    accumulatedTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
    setLastDetected(null);
    setSuggestions([]);
    lastResolvedMatchIndexRef.current = 0;
    if (isListening) {
      // It will automatically restart due to the onend handler
      recognitionRef.current?.stop();
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const stringified = JSON.stringify(suggestion.reference);
    if (stringified !== latestDetectedJSONRef.current) {
      latestDetectedJSONRef.current = stringified;
      setLastDetected(suggestion);
      onVerseDetected(suggestion.reference);
    }
  };

  return (
    <div className="h-full flex flex-col items-center bg-[#09090B] text-neutral-300">
      <div className="w-full max-w-3xl pb-20">
        
        <header className="mb-8 flex items-center justify-between p-6 md:p-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight mb-1 text-white">Live Audio Transcriber</h1>
            <p className="text-neutral-500 text-sm font-medium">
              Speak naturally. Matches push directly to the live output screen.
            </p>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 border border-white/10 bg-[#121214] rounded-full text-neutral-400 hover:text-white hover:bg-white/5 transition-all shadow-sm"
            title="Integration Settings"
          >
            <Settings size={18} />
          </button>
        </header>

        <div className="px-6 md:px-8">
          <div className="bg-[#121214] rounded-3xl border border-white/5 p-6 mb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${isListening ? 'bg-red-500/10 text-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-[#030303] text-neutral-500 border border-white/5'}`}>
                  {isListening ? <Activity size={24} /> : <MicOff size={24} />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{isListening ? "Listening..." : "Microphone Off"}</h2>
                  <div className="flex items-center space-x-2 text-sm text-neutral-500 font-medium mt-0.5">
                    <p>Try: "Let's open to John chapter 3 verse 16"</p>
                    {isAiProcessing && (
                      <span className="flex items-center space-x-1 text-purple-400 animate-pulse font-semibold">
                        <Sparkles size={14} />
                        <span>AI Thinking...</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={clearAndRestart}
                  className="px-5 py-2.5 rounded-full font-bold transition-all bg-[#030303] border border-white/5 hover:bg-white/5 text-neutral-300 shadow-sm"
                >
                  Clear
                </button>
                <button
                  onClick={toggleListening}
                  className={`px-6 py-2.5 rounded-full font-bold transition-all shadow-lg ${
                    isListening 
                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 shadow-red-500/10" 
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
                  }`}
                >
                  {isListening ? "Stop listening" : "Start listening"}
                </button>
              </div>
            </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-900/10 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-400 shadow-sm">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-sm tracking-tight">Microphone Issue</h3>
                <p className="text-sm font-medium mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-[#030303] rounded-2xl p-5 border border-white/5 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Live Transcript</span>
              </div>
              <p className="text-lg min-h-[4rem] text-neutral-200 font-medium leading-relaxed">
                {transcript || (
                  <span className="text-neutral-600 italic">Words will appear here...</span>
                )}
              </p>
            </div>

            {/* Extracted Data Box */}
            <div className={`rounded-2xl p-5 border transition-all shadow-md ${
              lastDetected 
                ? (lastDetected.debug?.confidence?.includes("AI") ? "bg-purple-900/10 border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.1)]" : "bg-blue-900/10 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.1)]")
                : "bg-[#030303] border-white/5 shadow-inner"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  {lastDetected?.debug?.confidence?.includes("AI") ? (
                     <Sparkles size={16} className="text-purple-400" />
                  ) : (
                     <BookOpen size={16} className={lastDetected ? "text-blue-400" : "text-neutral-600"} />
                  )}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    lastDetected 
                      ? (lastDetected.debug?.confidence?.includes("AI") ? "text-purple-400" : "text-blue-400") 
                      : "text-neutral-500"
                  }`}>
                    Currently Pushed To Screen
                  </span>
                </div>
              </div>
              
              {lastDetected ? (
                <div className="space-y-4">
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-3xl font-black tracking-tight ${lastDetected.debug?.confidence?.includes("AI") ? "text-purple-300" : "text-blue-300"}`}>
                      {lastDetected.reference.book} {lastDetected.reference.chapters[0]}:{lastDetected.reference.verses?.[0]?.[0]}
                    </span>
                  </div>
                  <pre className="bg-[#030303] p-4 rounded-xl text-sm text-neutral-400 font-mono overflow-x-auto border border-white/5 shadow-inner">
                    {JSON.stringify(lastDetected.reference, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm font-medium text-neutral-600 py-2">
                  Waiting to detect a Bible reference...
                </p>
              )}
            </div>

            {/* AI Suggestions Box */}
            {suggestions.length > 0 && (
              <div className="rounded-2xl p-5 border transition-all bg-purple-900/10 border-purple-500/20 shadow-lg">
                <div className="flex items-center space-x-2 mb-4">
                  <Sparkles size={16} className="text-purple-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                    AI Suggestions (Click to Push)
                  </span>
                </div>
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => {
                    const isSelected = 
                      lastDetected && 
                      JSON.stringify(lastDetected.reference) === JSON.stringify(suggestion.reference);

                    return (
                      <button
                        key={index}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className={`w-full text-left flex items-center justify-between p-4 rounded-xl border transition-all ${
                          isSelected
                            ? "bg-purple-600 border-transparent text-white shadow-lg shadow-purple-500/20"
                            : "bg-[#030303] border-white/5 hover:border-purple-500/30 text-neutral-300 hover:bg-[#121214] shadow-sm"
                        }`}
                      >
                        <div>
                          <p className={`font-bold tracking-tight ${isSelected ? "text-white text-lg" : "text-purple-300"}`}>
                            {suggestion.reference.book} {suggestion.reference.chapters[0]}:{suggestion.reference.verses[0]?.[0]}
                          </p>
                          <p className={`text-xs mt-1 font-medium ${isSelected ? "text-purple-200" : "text-neutral-500"} line-clamp-1`}>
                            {suggestion.confidence ? `${suggestion.confidence}% match. ` : ''}From: "{suggestion.debug.originalMatch}"
                          </p>
                        </div>
                        {isSelected ? (
                          <div className="flex-shrink-0 ml-3 flex items-center justify-center bg-white/20 rounded-full w-6 h-6">
                            <Check size={14} className="text-white" />
                          </div>
                        ) : (
                          <ChevronRight size={18} className="text-purple-500 opacity-50 flex-shrink-0 ml-3" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

       {/* Settings Modal - Kept in tact but styled darker */}
       {isSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer" 
            onClick={() => setIsSettingsOpen(false)}
          ></div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-end sm:justify-center items-center relative z-10 pointer-events-none">
            <div 
              className="bg-[#09090B] sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col sm:border border-white/10 animate-in slide-in-from-bottom duration-200 max-h-[90vh] pointer-events-auto rounded-t-2xl text-neutral-300 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-[#030303]">
                <h2 className="text-lg font-bold flex items-center text-white tracking-tight">
                  <Settings size={18} className="mr-2 text-blue-500" />
                  Integration Settings
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between p-5 border border-white/5 rounded-xl bg-[#030303] shadow-sm">
                  <div>
                    <h3 className="font-bold text-white tracking-tight">Enable Webhook</h3>
                    <p className="text-sm text-neutral-400 mt-1 font-medium">Send requests to an external software</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.enabled}
                      onChange={(e) => saveConfig({...config, enabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 border border-white/5 peer-checked:border-blue-500 shadow-inner"></div>
                  </label>
                </div>

                <div className={config.enabled ? "opacity-100 space-y-4" : "opacity-30 pointer-events-none space-y-4 transition-opacity"}>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Webhook URL</label>
                    <input 
                      type="text" 
                      value={config.url}
                      onChange={(e) => saveConfig({...config, url: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 bg-[#030303] border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold tracking-tight shadow-md shadow-blue-500/20 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
