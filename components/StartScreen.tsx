'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { Mic, Search, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";

// WMO weather code to condition string and icon
function getWeatherCondition(code: number): { text: string; icon: string } {
  if (code === 0) return { text: "Clear Sky", icon: "☀️" };
  if ([1, 2, 3].includes(code)) return { text: "Partly Cloudy", icon: "⛅" };
  if ([45, 48].includes(code)) return { text: "Foggy", icon: "🌫️" };
  if ([51, 53, 55].includes(code)) return { text: "Drizzle", icon: "🌧️" };
  if ([61, 63, 65].includes(code)) return { text: "Heavy Rain", icon: "🌧️" };
  if ([71, 73, 75].includes(code)) return { text: "Snowfall", icon: "❄️" };
  if (code === 77) return { text: "Snow Grains", icon: "❄️" };
  if ([80, 81, 82].includes(code)) return { text: "Showers", icon: "🌦️" };
  if ([85, 86].includes(code)) return { text: "Snow Showers", icon: "❄️" };
  if (code === 95) return { text: "Thunderstorm", icon: "⛈️" };
  if ([96, 99].includes(code)) return { text: "Severe Storm", icon: "⛈️" };
  return { text: "Unknown Weather", icon: "⛅" };
}

function getWindDirection(deg: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const val = Math.floor((deg / 22.5) + 0.5);
  return directions[val % 16];
}

function getMoonPhase(date: Date): { phase: string; icon: string } {
  const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const diffMs = date.getTime() - knownNewMoon.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const synodicMonth = 29.530588853;
  const cyclePosition = (diffDays / synodicMonth) % 1;
  const normalized = cyclePosition < 0 ? cyclePosition + 1 : cyclePosition;
  
  if (normalized < 0.03 || normalized > 0.97) return { phase: "New Moon", icon: "🌑" };
  if (normalized >= 0.03 && normalized < 0.22) return { phase: "Waxing Crescent", icon: "🌒" };
  if (normalized >= 0.22 && normalized < 0.28) return { phase: "First Quarter", icon: "🌓" };
  if (normalized >= 0.28 && normalized < 0.47) return { phase: "Waxing Gibbous", icon: "🌔" };
  if (normalized >= 0.47 && normalized < 0.53) return { phase: "Full Moon", icon: "🌕" };
  if (normalized >= 0.53 && normalized < 0.72) return { phase: "Waning Gibbous", icon: "🌖" };
  if (normalized >= 0.72 && normalized < 0.78) return { phase: "Last Quarter", icon: "🌗" };
  return { phase: "Waning Crescent", icon: "🌘" };
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function StartScreen() {
  const setIsAppStarted = useArchitectStore((state) => state.setIsAppStarted);
  const storePhase = useArchitectStore((state) => state.phase);
  const setStorePhase = useArchitectStore((state) => state.setPhase);

  const startScreenStages: { id: string; label: string; badge?: string }[] = [
    { id: 'render-zone', label: 'RENDER ZONE' },
    { id: 'edit', label: 'EDIT' },
    { id: '3d-render', label: '3D RENDER' },
    { id: 'png-to-dxf', label: 'PNG TO DXF', badge: 'NEW' },
    { id: 'flythrough', label: 'FLYTHROUGH' }
  ];

  const getInitialStage = (phase: string) => {
    if (phase === 'export') return 'render-zone';
    if (phase === 'edit' || phase === 'measure' || phase === 'generate') return 'edit';
    return 'render-zone';
  };

  const router = useRouter();

  // States
  const [activeMenuTab, setActiveMenuTab] = useState(() => getInitialStage(storePhase));
  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [statusState, setStatusState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('System ready. Click COMM LINK on the left to start.');
  const [responseHtml, setResponseHtml] = useState<React.ReactNode>(null);
  const chatHistoryRef = useRef<{role: string, content: string}[]>([]);
  const [marketData, setMarketData] = useState<Record<string, number> | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  
  interface NewsArticle {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
  }
  const [newsData, setNewsData] = useState<NewsArticle[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  
  const [mountTime] = useState(Date.now());
  const [uptime, setUptime] = useState("00:00:00");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  const [weatherData, setWeatherData] = useState<{
    location: string;
    temp: number;
    feelsLike: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    windDir: string;
    pressure: number;
    sunrise: string;
    sunset: string;
    moonPhase: { phase: string; icon: string };
    forecast: Array<{ day: string; dateStr: string; tempMax: number; tempMin: number; condition: string }>;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
      setUptime(formatUptime(Date.now() - mountTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [mountTime]);

  // Background music
  useEffect(() => {
    const audio = new Audio('/home page mp3/Batman Begins (OST) - Training.mp3.mpeg');
    audio.loop = true;
    audio.volume = 0.06;
    bgMusicRef.current = audio;

    const tryPlay = () => {
      audio.play().then(() => setIsMusicPlaying(true)).catch(() => {});
    };

    // Try autoplay
    tryPlay();

    // Also try on first user interaction in case autoplay is blocked
    const onInteract = () => {
      if (!isMusicPlaying) tryPlay();
      window.removeEventListener('click', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
    window.addEventListener('click', onInteract);
    window.addEventListener('keydown', onInteract);

    return () => {
      audio.pause();
      audio.src = '';
      window.removeEventListener('click', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, []);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const res = await fetch('/api/stocks');
        if (res.ok) {
          const data = await res.json();
          setMarketData(data);
          marketDataRef.current = data;
        }
      } catch (e) {}
    };
    fetchMarket();
    const interval = setInterval(fetchMarket, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setNewsLoading(true);
        const res = await fetch('/api/architect-news');
        if (res.ok) {
          const data = await res.json();
          setNewsData(data);
          newsDataRef.current = data;
        }
      } catch (e) {
        console.error("Failed to fetch news:", e);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchNews();
    const interval = setInterval(fetchNews, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async (lat: number, lon: number, customLocation?: string) => {
      if (!isMounted) return;
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        let locationName = customLocation || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        if (!customLocation) {
          try {
            const geoRes = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              const city = geoData.city || geoData.locality || geoData.principalSubdivision || "";
              const country = geoData.countryName || "";
              if (city && country) locationName = `${city}, ${country}`;
              else if (city) locationName = city;
            }
          } catch (geoErr) {}
        }

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
        const res = await fetch(weatherUrl);
        if (!res.ok) throw new Error("Weather service offline");
        const data = await res.json();
        if (!isMounted) return;

        const current = data.current;
        const daily = data.daily;
        const condObj = getWeatherCondition(current.weather_code);

        const formatTimeStr = (isoStr: string) => {
          try { return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } 
          catch (e) { return isoStr.split("T")[1] || isoStr; }
        };

        const forecastDays = ["Today", "Tomorrow"];
        const forecastList = [];
        for (let i = 0; i < 3; i++) {
          let dayName = forecastDays[i];
          if (!dayName && daily.time[i]) dayName = new Date(daily.time[i]).toLocaleDateString([], { weekday: 'long' });
          const dateObj = new Date(daily.time[i]);
          forecastList.push({
            day: dayName || `Day ${i + 1}`,
            dateStr: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            tempMax: Math.round(daily.temperature_2m_max[i]),
            tempMin: Math.round(daily.temperature_2m_min[i]),
            condition: getWeatherCondition(daily.weather_code[i]).text
          });
        }

        setWeatherData({
          location: locationName,
          temp: Math.round(current.temperature_2m),
          feelsLike: Math.round(current.apparent_temperature),
          condition: condObj.text,
          humidity: Math.round(current.relative_humidity_2m),
          windSpeed: Math.round(current.wind_speed_10m),
          windDir: getWindDirection(current.wind_direction_10m),
          pressure: Math.round(current.surface_pressure),
          sunrise: formatTimeStr(daily.sunrise[0]),
          sunset: formatTimeStr(daily.sunset[0]),
          moonPhase: getMoonPhase(new Date()),
          forecast: forecastList
        });
        setWeatherLoading(false);
      } catch (err: any) {
        if (isMounted) {
          setWeatherError(err.message || "Weather Service Offline");
          setWeatherLoading(false);
        }
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => fetchWeather(position.coords.latitude, position.coords.longitude),
        (error) => fetchWeather(19.3796, 72.8174, "Vasai, India"),
        { timeout: 8000 }
      );
    } else {
      fetchWeather(19.3796, 72.8174, "Vasai, India");
    }
    return () => { isMounted = false; };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
      setSearchQuery('');
    }
  };

  // ── Wake Greeting ─────────────────────────────────────────────────────────
  // Stores the greeting text once weather loads — played on first COMM LINK click
  // (Audio requires a user gesture; auto-playing on mount is blocked on Vercel/HTTPS)
  const hasGreetedRef = useRef(false);
  const pendingGreetingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!weatherData || pendingGreetingRef.current) return;

    const now = new Date();
    const hour = now.getHours();
    const timeOfDay =
      hour >= 5 && hour < 12  ? 'morning' :
      hour >= 12 && hour < 17 ? 'afternoon' :
      hour >= 17 && hour < 21 ? 'evening' : 'night';

    // Store greeting — will be spoken on first user click (COMM LINK)
    pendingGreetingRef.current = `Good ${timeOfDay}, Master Umesh. System online. How may I help you?`;
  }, [weatherData]);
  // ─────────────────────────────────────────────────────────────────────────


  // Refs
  const recognitionRef = useRef<any>(null);
  const isAgentSpeakingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const shouldListenRef = useRef(false); // Start ASLEEP
  const statusStateRef = useRef<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingAudioRef = useRef(false);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef(false);
  const isSystemOnlineRef = useRef(true);
  const marketDataRef = useRef<Record<string, number> | null>(null);
  const newsDataRef = useRef<NewsArticle[] | null>(null);
  // Always points to the latest processCommand — avoids stale closure inside the recognition useEffect
  const processCommandRef = useRef<(cmd: string) => void>(() => {});

  const resetSleepTimer = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => {
      shouldListenRef.current = false;
      stopListening();
      setStatusState('idle');
      setTranscript("Voice Link offline. Press Comm Link to wake.");
    }, 60000); // 60 seconds of silence = go to sleep
  };

  useEffect(() => {
    statusStateRef.current = statusState;
  }, [statusState]);

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Guard: prevents calling .start() while already running (the crash-loop cause)
    let isRunning = false;

    const safeStart = () => {
      if (!isRunning && shouldListenRef.current) {
        try {
          recognition.start();
          isRunning = true;
        } catch (e) {}
      }
    };

    recognition.onstart = () => { isRunning = true; };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        // If Batman is still speaking, queue the command — don't drop it
        if (isAgentSpeakingRef.current) {
          console.log('[Batman STT] Final transcript captured while speaking — will process after audio ends');
          // Still call processCommandRef — it checks statusStateRef internally
          // so it will be ignored correctly if not in listening state
        }
        processCommandRef.current(finalTranscript.trim());
      } else if (interimTranscript) {
        setTranscript(interimTranscript);
      }
    };


    recognition.onerror = (event: any) => {
      // no-speech is NORMAL in continuous mode — browser just didn't hear anything in a segment.
      // DO NOT restart here — it causes the rapid restart death-loop. Let onend handle it.
      if (event.error !== 'no-speech') {
        console.warn('[Batman STT] error:', event.error);
      }
      // aborted = we stopped it intentionally, don't restart
      if (event.error === 'aborted') {
        isRunning = false;
      }
    };

    recognition.onend = () => {
      isRunning = false;
      // Only restart if we should still be listening and not mid-processing
      if (shouldListenRef.current && statusStateRef.current === 'listening') {
        // Small delay to prevent immediate re-crash on rapid no-speech cycles
        setTimeout(safeStart, 250);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      isRunning = false;
      try { recognition.stop(); } catch(e){}
      interruptSpeech();
    };
  }, []);

  const interruptSpeech = () => {
    isAgentSpeakingRef.current = false;
    isStreamingRef.current = false;
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch(e){}
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch(e){}
    }
    setStatusState('idle');
  };
  
  const startListening = () => {
    if (!recognitionRef.current || !shouldListenRef.current) return;
    setStatusState('listening');
    // Small delay to ensure any previous session has fully ended before starting
    setTimeout(() => {
      try { recognitionRef.current?.start(); } catch (e) {
        // Already running or not ready — fine, onstart will set state
      }
    }, 100);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
       try { recognitionRef.current.stop(); } catch (e) {}
    }
  };

  const toggleSystem = () => {
    if (shouldListenRef.current) {
      setIsSystemOnline(false);
      isSystemOnlineRef.current = false;
      shouldListenRef.current = false;
      stopListening();
      setStatusState('idle');
      setTranscript('BAT-ASSISTANT offline.');
    } else {
      setIsSystemOnline(true);
      isSystemOnlineRef.current = true;

      // Play pending greeting on first click — user gesture unlocks audio on all browsers
      if (!hasGreetedRef.current && pendingGreetingRef.current) {
        hasGreetedRef.current = true;
        const greeting = pendingGreetingRef.current;
        setStatusState('speaking');
        setTranscript(greeting);
        speak(greeting, () => {
          shouldListenRef.current = true;
          startListening();
        });
      } else {
        shouldListenRef.current = true;
        startListening();
        setTranscript('Voice link active. Start speaking...');
      }
    }
  };

  const handleMicClick = () => {
    if (statusState === 'listening') {
      shouldListenRef.current = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      stopListening();
      setStatusState('idle');
      setTranscript("Voice link offline.");
    } else {
      shouldListenRef.current = true;
      resetSleepTimer();
      startListening();
      setTranscript("Voice link active. Start speaking...");
    }
  };

  const getFormattedDate = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const getFormattedTime = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

  const extractSpeakableChunk = (text: string): { chunk: string; remaining: string } | null => {
    const trimmed = text.trimStart();
    if (!trimmed) return null;

    // Look for natural sentence or clause boundaries (. ? ! , ; : \n)
    // We only split here to preserve the TTS engine's natural intonation and prosody.
    // Splitting by arbitrary word counts breaks the AI's "voice acting".
    const boundaryMatch = trimmed.match(/[.?!,;:\n]+(\s+|$)/);
    
    if (boundaryMatch) {
      const splitIndex = (boundaryMatch.index ?? 0) + boundaryMatch[0].length;
      return {
        chunk: trimmed.slice(0, splitIndex),
        remaining: trimmed.slice(splitIndex)
      };
    }

    // No natural pause found yet. We will wait for more tokens to stream in.
    return null;
  };

  const callOpenAIAndStream = async (userMsg: string) => {
    const lowerCmd = userMsg.toLowerCase().trim();
    if (lowerCmd.includes("enter system") || lowerCmd.includes("start the application") || lowerCmd.includes("open the app")) {
      speakStreamedSentence("Entering the Architect System, Master Umesh.");
      return;
    }

    try {
      const store = useArchitectStore.getState();
      const phase = store.phase;
      const params = store.collectedParameters;
      const rooms = params.rooms.length > 0 ? params.rooms.join(', ') : 'None';
      const plotArea = params.plotArea;
      const orientation = params.orientation;
      const hasFloorPlan = !!store.currentFloorPlan;

      let marketStr = "Market data currently unavailable.";
      const currentMarketData = marketDataRef.current;
      if (currentMarketData) {
        const stocksList = [
          { name: "Reliance Industries", sym: "RELIANCE.NS" },
          { name: "TCS", sym: "TCS.NS" },
          { name: "HDFC Bank", sym: "HDFCBANK.NS" }
        ];
        marketStr = stocksList
          .map(s => {
            const val = currentMarketData[s.sym];
            if (val === undefined) return `- ${s.name}: N/A`;
            return `- ${s.name}: ₹${val.toFixed(2)}`;
          })
          .join('\n');
      }

      let newsStr = "No architectural news available.";
      const currentNewsData = newsDataRef.current;
      if (currentNewsData && currentNewsData.length > 0) {
        newsStr = currentNewsData
          .map((item, idx) => `${idx + 1}. [${item.source}] ${item.title}\n   Summary: ${item.description}\n   Link: ${item.link}`)
          .join('\n\n');
      }

      const contextStr = `Today is ${getFormattedDate()}. Time is ${getFormattedTime()}.
CURRENT PROJECT STATUS:
- Phase: ${phase}
- Plot: ${plotArea ? plotArea + ' sq ft' : 'not configured'}
- Orientation: ${orientation || 'not configured'}
- Rooms: ${rooms}
- Floor Plan: ${hasFloorPlan ? 'Generated' : 'Not generated'}

REAL-TIME STOCK/MARKET METRICS:
${marketStr}

BREAKING ARCHITECTURAL NEWS & DIGEST:
${newsStr}`;

      isStreamingRef.current = true;

      const response = await fetch('/api/openai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemContext: contextStr,
          messages: [
            ...chatHistoryRef.current,
            { role: 'user', content: userMsg }
          ]
        })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let completeResponse = "";
      let currentSentence = "";
      let streamBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6));
              const token = parsed.choices[0]?.delta?.content || "";
              if (!token) continue;

              completeResponse += token;
              currentSentence += token;
              
              setResponseHtml(
                <div className="bg-[#0f0f18] border border-[#1e1810] rounded-xl p-4 mb-2 text-[#c8a84b] font-mono font-bold">
                  {completeResponse}
                </div>
              );

              // Use our smart sentence/clause/word-count extractor to queue speaking early!
              let splitResult = extractSpeakableChunk(currentSentence);
              while (splitResult) {
                speakStreamedSentence(splitResult.chunk.trim());
                currentSentence = splitResult.remaining;
                splitResult = extractSpeakableChunk(currentSentence);
              }
            } catch (e) {}
          }
        }
      }

      // Process any leftover line in streamBuffer
      if (streamBuffer && streamBuffer.startsWith('data: ') && streamBuffer !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(streamBuffer.slice(6));
          const token = parsed.choices[0]?.delta?.content || "";
          if (token) {
            completeResponse += token;
            currentSentence += token;
            
            setResponseHtml(
              <div className="bg-[#0f0f18] border border-[#1e1810] rounded-xl p-4 mb-2 text-[#c8a84b] font-mono font-bold">
                {completeResponse}
              </div>
            );
          }
        } catch (e) {}
      }

      // Flush remaining text
      if (currentSentence.trim()) {
        speakStreamedSentence(currentSentence.trim());
      }
      
      chatHistoryRef.current = [...chatHistoryRef.current, {role: 'user', content: userMsg}, {role: 'assistant', content: completeResponse}].slice(-10);

    } catch (e) {
      console.error("OpenAI stream failed:", e);
      speakStreamedSentence("Sorry, I am having trouble connecting to my systems right now.");
    } finally {
      isStreamingRef.current = false;
      // If we finished streaming and there is no active audio playing, transition back to idle
      if (!isPlayingAudioRef.current && audioQueueRef.current.length === 0) {
        setStatusState('idle');
        shouldListenRef.current = true;
        startListening();
      }
    }
  };

  const renderResponse = (res: any) => {
    if (!res.message && !res.greeting) {
      setResponseHtml(null);
      return;
    }
    
    setResponseHtml(
      <div className="bg-[#0f0f18] border border-[#1e1810] rounded-xl p-4 mb-2 text-[#c8a84b] font-mono font-bold">
        {res.greeting || res.message}
      </div>
    );
  };

  const processAudioQueue = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;
    
    isPlayingAudioRef.current = true;
    const audio = audioQueueRef.current.shift()!;
    
    setStatusState('speaking');
    isAgentSpeakingRef.current = true;

    try {
      currentAudioRef.current = audio;
      
      await new Promise<void>((resolve) => {
        // Safety timeout: if audio hangs for any reason (network, Vercel edge, etc.),
        // force-resolve after 15s so the mic is NEVER permanently blocked
        const safetyTimer = setTimeout(() => {
          console.warn('[Batman Audio] Safety timeout fired — forcing resolve');
          if (bgMusicRef.current) bgMusicRef.current.volume = 0.06;
          resolve();
        }, 15000);

        const cleanup = () => {
          clearTimeout(safetyTimer);
          if (bgMusicRef.current) bgMusicRef.current.volume = 0.06;
          resolve();
        };

        // Duck background music while Batman speaks
        if (bgMusicRef.current) bgMusicRef.current.volume = 0.01;
        audio.onended = cleanup;
        audio.onerror = () => { console.warn('[Batman Audio] onerror fired'); cleanup(); };
        audio.onstalled = () => { console.warn('[Batman Audio] onstalled'); cleanup(); };

        try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('[Batman Audio] play() rejected:', err.name, err.message);
              cleanup();
            });
          }
        } catch (syncErr) {
          console.warn('[Batman Audio] play() threw synchronously:', syncErr);
          cleanup();
        }
      });
      currentAudioRef.current = null;
    } catch (e) {
      console.error('[Batman Audio] processAudioQueue exception:', e);
      if (bgMusicRef.current) bgMusicRef.current.volume = 0.06;
    }

    isPlayingAudioRef.current = false;
    
    if (audioQueueRef.current.length > 0) {
      await processAudioQueue();
    } else {
      isAgentSpeakingRef.current = false; // Always reset — never leave stuck
      if (isStreamingRef.current) {
        setStatusState('thinking');
      } else {
        setStatusState('idle');
        shouldListenRef.current = true;
        startListening();
      }
    }
  };


  const speakStreamedSentence = (text: string, onComplete?: () => void) => {
    if (!text) return;
    
    // Create the Audio object immediately! The browser will start fetching the stream in the background
    // right now, so by the time the current audio finishes, this one is already fully buffered!
    const audioUrl = `/api/openai-tts?text=${encodeURIComponent(text)}`;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.volume = 1.0; // Batman's voice at full volume
    
    audioQueueRef.current.push(audio);
    
    processAudioQueue().then(() => {
       if (onComplete) onComplete();
    });
  };

  const speak = (text: string, onComplete?: () => void) => {
    audioQueueRef.current = []; // Clear queue
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    isPlayingAudioRef.current = false;
    speakStreamedSentence(text, onComplete);
  };

  // Keep processCommandRef in sync with the latest closure every render
  const processCommand = async (cmd: string) => {
    if (!isSystemOnlineRef.current) return;
    if (statusStateRef.current !== 'listening') {
      console.log(`[Command Processor] Ignored command "${cmd}" because state is: ${statusStateRef.current}`);
      return;
    }

    resetSleepTimer();

    stopListening();
    
    // Synchronously lock state to 'thinking' (PROCESSING) to prevent parallel triggers
    statusStateRef.current = 'thinking';
    setStatusState('thinking');
    setTranscript(cmd);
    setResponseHtml(null);

    const lowerCmd = cmd.toLowerCase().trim();
    if (lowerCmd.includes("enter system") || lowerCmd.includes("start the application") || lowerCmd.includes("open the app")) {
      await speak("Entering the Architect System.", () => {
        setIsAppStarted(true);
      });
      return;
    }

    // Check if the user is affirming a suggestion from Batman
    const isAffirmative = ["yes", "sure", "do it", "please", "yeah", "open", "yep", "ok", "okay"].some(word => lowerCmd.includes(word));
    if (isAffirmative) {
      // Find the last thing Batman said
      const lastAssistantMsg = [...chatHistoryRef.current].reverse().find(msg => msg.role === 'assistant');
      if (lastAssistantMsg && lastAssistantMsg.content.includes("Would you like me to open the")) {
        const contentStr = lastAssistantMsg.content.toLowerCase();
        if (contentStr.includes("render zone")) {
           setActiveMenuTab('render-zone');
           await speak("Accessing Project Archive, Master Umesh.", () => router.push('/projects'));
           return;
        } else if (contentStr.includes("edit")) {
           setActiveMenuTab('edit');
           setStorePhase('edit');
           await speak("Entering Edit Matrix, Master Umesh.", () => router.push('/edit'));
           return;
        } else if (contentStr.includes("3d render")) {
           setActiveMenuTab('3d-render');
           setStorePhase('edit');
           await speak("Initializing 3D visualization, Master Umesh.", () => router.push('/3d-render'));
           return;
        } else if (contentStr.includes("png to dxf") || contentStr.includes("vector")) {
           setActiveMenuTab('png-to-dxf');
           await speak("Initiating vector conversion suite, Master Umesh.", () => router.push('/png-to-dxf'));
           return;
        } else if (contentStr.includes("flythrough") || contentStr.includes("flightpath")) {
           setActiveMenuTab('flythrough');
           setStorePhase('edit');
           await speak("Flightpath parameters loaded, Master Umesh.");
           return;
        }
      }
    }

    // Voice Navigation Command Protocols
    if (lowerCmd.includes("render zone") || lowerCmd.includes("project archive") || lowerCmd.includes("projects") || lowerCmd.includes("open projects") || lowerCmd.includes("open render zone")) {
      setActiveMenuTab('render-zone');
      await speak("Accessing Project Archive, Master Umesh.", () => {
        router.push('/projects');
      });
      return;
    }
    if (lowerCmd.includes("edit matrix") || lowerCmd.includes("open edit") || (lowerCmd.includes("edit") && !lowerCmd.includes("credits"))) {
      setActiveMenuTab('edit');
      setStorePhase('edit');
      await speak("Entering Edit Matrix, Master Umesh.", () => {
        router.push('/edit');
      });
      return;
    }
    if (lowerCmd.includes("3d render") || lowerCmd.includes("3d visualization") || lowerCmd.includes("three d render") || lowerCmd.includes("open 3d render") || lowerCmd.includes("open 3d")) {
      setActiveMenuTab('3d-render');
      setStorePhase('edit');
      await speak("Initializing 3D visualization, Master Umesh.", () => {
        router.push('/3d-render');
      });
      return;
    }
    if (lowerCmd.includes("flythrough") || lowerCmd.includes("flightpath") || lowerCmd.includes("open flythrough")) {
      setActiveMenuTab('flythrough');
      setStorePhase('edit');
      await speak("Flightpath parameters loaded, Master Umesh.");
      return;
    }

    // Clear past queues
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch(e) {}
    }
    isPlayingAudioRef.current = false;

    // Trigger Streaming Chat
    await callOpenAIAndStream(cmd);
  };

  // Sync processCommandRef on every render so the speech recognition closure always sees the latest version
  // eslint-disable-next-line react-hooks/exhaustive-deps
  processCommandRef.current = processCommand;

  useEffect(() => {
    setActiveMenuTab(getInitialStage(storePhase));
  }, [storePhase]);

  const handleMenuClick = (stageId: string) => {
    if (statusState === 'speaking' || statusState === 'thinking') return; // Prevent double trigger
    setActiveMenuTab(stageId);
    
    if (stageId === 'render-zone') {
      speak("Accessing Project Archive, Master Umesh.", () => {
        router.push('/projects');
      });
    } else if (stageId === 'edit') {
      setStorePhase('edit');
      speak("Entering Edit Matrix, Master Umesh.", () => {
        router.push('/edit');
      });
    } else if (stageId === '3d-render') {
      setStorePhase('edit');
      speak("Initializing 3D visualization, Master Umesh.", () => {
        router.push('/3d-render');
      });
    } else if (stageId === 'png-to-dxf') {
      speak("Initiating vector conversion suite, Master Umesh.", () => {
        router.push('/png-to-dxf');
      });
    } else if (stageId === 'flythrough') {
      setStorePhase('edit');
      speak("Flightpath parameters loaded, Master Umesh.");
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0a0a0f] flex flex-col items-center justify-center font-mono overflow-hidden z-50 text-batman-white">
      
      <div className="vignette-overlay pointer-events-none absolute inset-0 z-0" />
      <div className="tech-grid pointer-events-none absolute inset-0 z-0 opacity-20" />

      {/* Video Background */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        src="/start video/start.mp4" 
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-80"
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_transparent_0%,_#0a0a0f_90%)] z-0 pointer-events-none" />

      {/* Eyes Overlay - Fixed absolute positioning relative to screen to align with video */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center">
        <div className="relative w-full max-w-[1200px] h-full">
          <div className={`absolute rounded-full transition-all duration-400 ${statusState !== 'idle' ? 'bg-[#00f0ff] shadow-[0_0_8px_4px_#00d2ff,0_0_20px_10px_#0088ff,0_0_40px_16px_#0044ff66]' : 'bg-transparent'}`} 
               style={{ top: '30.6%', left: '48.4%', width: '1.5%', height: '0.8%' }} />
          <div className={`absolute rounded-full transition-all duration-400 ${statusState !== 'idle' ? 'bg-[#00f0ff] shadow-[0_0_8px_4px_#00d2ff,0_0_20px_10px_#0088ff,0_0_40px_16px_#0044ff66]' : 'bg-transparent'}`} 
               style={{ top: '30.6%', left: '54.4%', width: '1.5%', height: '0.8%' }} />
        </div>
      </div>

      {/* Central Bat-Signal Ring */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-[420px] h-[420px] flex items-center justify-center pointer-events-none select-none opacity-40">
        <svg className="w-full h-full absolute" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="3.5" strokeDasharray="3, 10" className="animate-[spin_20s_linear_infinite]" style={{ transformOrigin: '200px 200px' }} />
          <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(0, 240, 255, 0.15)" strokeWidth="2" strokeDasharray="6, 16" className="animate-[spin_15s_linear_infinite_reverse]" style={{ transformOrigin: '200px 200px' }} />
          <circle cx="200" cy="200" r="135" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="1" />
        </svg>
      </div>

      {/* Top HUD Clock Panel */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 pointer-events-none select-none">
        <div className="relative w-14 h-14 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="3" />
            <motion.circle
              cx="28" cy="28" r="22" fill="none" stroke="#00f0ff" strokeWidth="3" strokeDasharray="138.2"
              animate={{ strokeDashoffset: 138.2 - (currentDate.getSeconds() / 60) * 138.2 }}
              transition={{ ease: "linear", duration: 0.2 }}
              className="drop-shadow-[0_0_4px_#00f0ff]"
            />
          </svg>
          <span className="absolute text-[10px] font-mono text-cyan-400">
            {currentDate.getSeconds().toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-rajdhani text-2xl font-bold tracking-[2px] text-cyan-400 drop-shadow-[0_0_6px_rgba(0,240,255,0.4)]">
              {currentDate.getHours().toString().padStart(2, '0')}:{currentDate.getMinutes().toString().padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[1px]">
              {currentDate.toLocaleDateString([], { weekday: 'short' })}
            </span>
          </div>
          <span className="text-[10px] font-mono text-cyan-500/80 tracking-[1.5px] uppercase -mt-1">
            {currentDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Tactical Weather Metrics Panel */}
      <div className="fixed top-10 left-6 z-[10] w-76 select-none pointer-events-none bg-[#0a0a0f]/80 backdrop-blur border border-cyan-500/20 rounded-lg p-4">
        <div className="flex flex-col gap-3">
          <div className="border-b border-cyan-500/20 pb-2">
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase block text-left">TACTICAL METRICS</span>
            <h3 className="font-rajdhani text-[15px] font-bold text-cyan-400 tracking-[1px] uppercase truncate text-left">
              {weatherLoading ? "FETCHING DATA..." : weatherError ? "SERVICE OFFLINE" : weatherData?.location}
            </h3>
          </div>
          {weatherLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              <span className="text-[9px] text-cyan-500/60 tracking-[1.5px] uppercase">ANALYZING GEOLOCATION...</span>
            </div>
          ) : weatherError ? (
            <div className="py-4 flex flex-col items-center justify-center gap-1.5 text-center">
              <span className="text-xl">⚠️</span>
              <span className="text-[10px] text-cyan-400 font-bold tracking-[2px] uppercase">WEATHER OFFLINE</span>
            </div>
          ) : weatherData ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="font-rajdhani text-4xl font-bold tracking-tight text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                  {weatherData.temp}°C
                </span>
                <div className="text-right">
                  <span className="text-cyan-400 font-bold block uppercase tracking-[1px] text-[11px]">{weatherData.condition}</span>
                  <span className="text-[9px] text-cyan-500/60 uppercase block">Feels Like: {weatherData.feelsLike}°C</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-b border-cyan-500/10 py-2.5 my-0.5 text-[10px]">
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Humidity:</span><span className="text-cyan-400 font-bold">{weatherData.humidity}%</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Wind:</span><span className="text-cyan-400 font-bold truncate max-w-[55px]">{weatherData.windSpeed} km/h {weatherData.windDir}</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Pressure:</span><span className="text-cyan-400 font-bold">{weatherData.pressure} mb</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Moon:</span><span className="text-cyan-400 font-bold">{weatherData.moonPhase.icon} {weatherData.moonPhase.phase.split(" ")[0]}</span></div>
              </div>
              <div className="flex flex-col gap-1.5 pt-0.5 text-left">
                <span className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase mb-1 font-bold">3-DAY FORECAST</span>
                {weatherData.forecast.map((day, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] bg-cyan-950/20 px-2 py-1 rounded border border-cyan-500/10">
                    <span className="text-cyan-400 font-bold uppercase text-[9px]">{day.day}</span>
                    <span className="text-cyan-500/60 uppercase truncate max-w-[90px] text-right text-[9px]">{day.condition}</span>
                    <span className="text-cyan-400 font-bold font-mono text-[10px] text-right">{day.tempMax}° / {day.tempMin}°</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* System Uptime Counter */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[5] pointer-events-none select-none text-center">
        <span className="text-[9px] tracking-[4px] text-cyan-500/40 uppercase block">SYSTEM UPTIME</span>
        <span className="font-mono text-sm font-semibold text-cyan-400 drop-shadow-[0_0_4px_rgba(0,240,255,0.4)] tracking-[2px]">
          {uptime}
        </span>
      </div>

      {/* HUD Search Bar */}
      <div className="fixed bottom-10 left-6 z-[20] w-76 select-text pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <input
            type="text"
            placeholder="GOOGLE MATRIX QUERY..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-cyan-950/30 hover:bg-cyan-950/40 focus:bg-cyan-950/50 border border-cyan-500/30 focus:border-cyan-400/80 focus:outline-none rounded px-3 py-2 pl-8 text-[10px] font-mono text-cyan-400 placeholder-cyan-500/40 transition-all duration-300 tracking-[1.5px] uppercase backdrop-blur-md"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-500/60 group-focus-within:text-cyan-400 transition-colors" />
        </form>
      </div>

      {/* Top Right: System Toggle */}
      <div className="fixed top-10 right-6 flex items-center justify-between w-[220px] bg-[#0f0f18]/80 backdrop-blur border border-[#1e1810] rounded-lg px-4 py-2 z-10">
        <span className="text-[10px] tracking-widest text-[#4a3a1a] uppercase font-bold">BAT-ASSISTANT</span>
        <button 
          onClick={toggleSystem}
          className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] tracking-wider transition-all ${isSystemOnline ? 'border border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/5 shadow-[0_0_10px_rgba(0,240,255,0.2)]' : 'border border-red-500 text-red-500 bg-red-500/5'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isSystemOnline ? 'bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]' : 'bg-red-500'}`} />
          {isSystemOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
      </div>


      {/* Left HUD Voice Assistant Panel */}
      <div className="fixed left-16 top-[74%] -translate-y-1/2 z-10 w-64 select-none text-left hidden md:block">
        <div className="relative pl-6 py-2">
          {/* Gold Glow Vertical Line */}
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#c8a84b]/10 via-[#c8a84b] to-[#c8a84b]/10 shadow-[0_0_8px_#c8a84b]" />
          
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-[10px] tracking-[4px] text-[#c8a84b] uppercase font-mono font-bold block">
              BAT-ASSISTANT
            </span>
            <h2 className="font-rajdhani text-2xl font-bold tracking-[2px] text-white uppercase drop-shadow-[0_0_6px_rgba(200,168,75,0.2)]">
              TALK TO BATMAN
            </h2>
          </div>
          
          <div className="flex flex-col gap-4 font-mono text-sm tracking-[2px] uppercase">
            <button
              onClick={handleMicClick}
              className={`w-full py-3 px-4 rounded border uppercase tracking-wider font-bold text-[10px] transition-all duration-300 flex items-center justify-between group cursor-pointer ${
                statusState === 'listening'
                  ? 'border-[#00f0ff] bg-[#00f0ff]/10 text-[#00f0ff] shadow-[0_0_12px_#00f0ff]'
                  : statusState === 'speaking'
                  ? 'border-[#5bc8af] bg-[#5bc8af]/10 text-[#5bc8af] shadow-[0_0_12px_#5bc8af]'
                  : 'border-[#3a2c10] bg-[#1a1408] text-[#c8a84b] hover:border-[#c8a84b] hover:bg-[#251d0c]'
              }`}
            >
              <Mic size={14} className={statusState === 'listening' ? 'animate-bounce' : ''} />
              <span>
                {statusState === 'listening' ? 'LINK_ACTIVE' : 
                 statusState === 'speaking' ? 'TRANSMITTING' : 
                 'START_COMMS'}
              </span>
            </button>
            
            {/* Waveform indicator */}
            <div className="flex items-center gap-1 h-6 pl-2 mt-2">
              {Array.from({length: 8}).map((_, i) => (
                <div 
                  key={`hud-wave-${i}`} 
                  className={`w-[3px] rounded transition-all duration-100 ${
                    statusState === 'listening' ? 'bg-[#00f0ff] animate-pulse' : 
                    statusState === 'speaking' ? 'bg-[#5bc8af] animate-pulse' : 
                    'bg-[#3a2c10] h-1'
                  }`}
                  style={{ 
                    animationDelay: `${i * 0.06}s`, 
                    height: (statusState === 'listening' || statusState === 'speaking') ? `${[6, 12, 8, 14, 10, 16, 9, 5][i]}px` : '4px' 
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right HUD Menu Panel */}
      <div className="fixed right-16 top-1/2 -translate-y-1/2 z-10 w-64 select-none text-left hidden md:block">
        <div className="relative pl-6 py-2">
          {/* Cyan Glow Vertical Line */}
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/10 via-cyan-400 to-cyan-500/10 shadow-[0_0_8px_#00f0ff]" />
          
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-[10px] tracking-[4px] text-cyan-500/60 uppercase font-mono font-bold block">
              SYSTEM INTERFACE
            </span>
            <h2 className="text-2xl font-bold tracking-[2px] text-white uppercase drop-shadow-[0_0_6px_rgba(255,255,255,0.2)]" style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}>
              MAIN MENU
            </h2>
          </div>
          
          <div className="flex flex-col gap-4 font-mono text-sm tracking-[2px] uppercase">
            {startScreenStages.map((stage) => {
              const isActive = activeMenuTab === stage.id;
              return (
                <button
                  key={stage.id}
                  onClick={() => handleMenuClick(stage.id)}
                  className={`flex items-center justify-between w-full group transition-all duration-300 ${
                    isActive 
                      ? 'text-[#00f0ff] font-bold drop-shadow-[0_0_8px_rgba(0,240,255,0.6)] translate-x-1' 
                      : 'text-cyan-500/50 hover:text-cyan-400/80 hover:translate-x-0.5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span 
                      className={`text-[10px] transition-all duration-300 ${
                        isActive 
                          ? 'opacity-100 scale-110 text-[#00f0ff]' 
                          : 'opacity-0 scale-75 text-transparent group-hover:opacity-50 group-hover:text-cyan-400 group-hover:scale-95'
                      }`}
                    >
                      ▶
                    </span>
                    <span className="font-semibold" style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}>{stage.label}</span>
                  </div>
                  {stage.badge && (
                    <span 
                      className={`text-[8px] px-1.5 py-0.5 rounded font-bold tracking-normal transition-colors duration-300 ${
                        isActive 
                          ? 'bg-[#00f0ff] text-black shadow-[0_0_6px_rgba(0,240,255,0.4)]' 
                          : 'bg-cyan-950/40 text-cyan-500/60 border border-cyan-500/20 group-hover:border-cyan-400/40 group-hover:text-cyan-400/80'
                      }`}
                    >
                      {stage.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main UI Container - Pushed to the bottom */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md p-6 mt-auto pb-12">


        {/* Mic Button & Waveform Container - Mobile Only */}
        <div className="flex items-center gap-6 mb-6 md:hidden">
          <div className="flex items-center justify-center gap-1 h-6 w-16">
            {Array.from({length: 4}).map((_, i) => (
              <div 
                key={`left-${i}`} 
                className={`w-[3px] bg-[#c8a84b] rounded transition-all duration-100 ${(statusState === 'listening' || statusState === 'speaking') ? 'animate-pulse' : 'h-1'}`}
                style={{ animationDelay: `${i * 0.08}s`, height: (statusState === 'listening' || statusState === 'speaking') ? `${[8, 14, 10, 16][i]}px` : '4px' }}
              />
            ))}
          </div>

          <button 
            onClick={handleMicClick}
            className={`w-16 h-16 rounded-full flex shrink-0 items-center justify-center transition-all ${statusState === 'listening' ? 'bg-[#c8a84b] text-[#0a0a0f] border-none animate-bounce' : 'bg-[#1a1408] border-2 border-[#3a2c10] text-[#c8a84b] hover:bg-[#251d0c] hover:border-[#c8a84b]'}`}
          >
            <Mic size={24} />
          </button>

          <div className="flex items-center justify-center gap-1 h-6 w-16">
            {Array.from({length: 4}).map((_, i) => (
              <div 
                key={`right-${i}`} 
                className={`w-[3px] bg-[#c8a84b] rounded transition-all duration-100 ${(statusState === 'listening' || statusState === 'speaking') ? 'animate-pulse' : 'h-1'}`}
                style={{ animationDelay: `${(i+4) * 0.08}s`, height: (statusState === 'listening' || statusState === 'speaking') ? `${[15, 9, 13, 7][i]}px` : '4px' }}
              />
            ))}
          </div>
        </div>

        {/* Status Label */}
        <div className={`text-[10px] tracking-[3px] uppercase mb-4 h-4 transition-colors ${statusState === 'listening' ? 'text-[#c8a84b]' : statusState === 'thinking' ? 'text-[#c8a84b]' : statusState === 'speaking' ? 'text-[#5bc8af]' : 'text-[#3a2c10]'}`}>
          {statusState === 'listening' ? 'listening...' : 
           statusState === 'thinking' ? 'processing...' : 
           statusState === 'speaking' ? 'speaking...' : 
           'voice interface offline'}
        </div>

        <div className="w-full bg-[#0f0f18]/90 backdrop-blur border border-[#1e1810] rounded-xl p-4 mb-4 min-h-[52px]">
          <div className="text-[9px] tracking-widest text-[#3a2c10] uppercase mb-1">you said</div>
          <div className="text-[13px] text-[#c8a84b]">{transcript}</div>
        </div>

        {/* Response */}
        <div className="w-full mb-4">
          {responseHtml}
        </div>

        {/* Render Zone Button (Removed as per user request) */}

      </div>
    </div>
  );
}
