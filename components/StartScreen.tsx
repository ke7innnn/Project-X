'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { Mic, Search, Loader2, Volume2, VolumeX, WifiOff, HandMetal } from 'lucide-react';
import { motion } from 'framer-motion';

// ⚠️ No client-side API keys — all API calls go through server routes.

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

const lastToolLabelMap: Record<string, string> = {
  'concept-generator': 'CONCEPT GENERATOR',
  'idea-generation': 'IDEA GENERATION',
  'edit': 'EDIT',
  '3d-render': '3D RENDER',
  'enhancement': 'ENHANCEMENT',
  'png-to-dxf': 'PNG TO DXF',
  'flythrough': 'FLYTHROUGH'
};

function getBatmanGreeting(hour: number): string {
  if (hour >= 0 && hour < 5) {
    const lines = [
      "Working late again, Umesh?",
      "Gotham never sleeps. Neither do we, Umesh.",
      "The shadows are long. Let's make this count, Umesh."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 5 && hour < 9) {
    const lines = [
      "Up before Gotham. Let's move, Umesh.",
      "The sun is rising, but our work isn't done. Let's start, Umesh.",
      "No rest for the vigilant, Umesh. What's the plan?"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 9 && hour < 17) {
    const lines = [
      "Systems nominal. What do you need, Umesh?",
      "Mainframe active. State your objective, Umesh.",
      "The day is half gone, Umesh. Let's get to work."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 17 && hour < 21) {
    const lines = [
      "Evening patrol's about to start, Umesh.",
      "Sun's setting. The city is changing, Umesh.",
      "We're running out of daylight, Umesh. Focus."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else {
    const lines = [
      "The city's quiet. For now, Umesh.",
      "Night watch initialized, Umesh. Speak.",
      "The darkness suits us, Umesh. What's next?"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
}

function playSonarPing() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(60, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.6);
    
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc2.start();
    osc.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (e) {
    console.error('Audio synthesis failed:', e);
  }
}

function playMenuHoverSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.035);
    
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.035);
  } catch (e) {
    // Ignore audio restrictions
  }
}

export default function StartScreen() {
  const setIsAppStarted = useArchitectStore((state) => state.setIsAppStarted);
  const storePhase = useArchitectStore((state) => state.phase);
  const setStorePhase = useArchitectStore((state) => state.setPhase);

  const startScreenStages: { id: string; label: string; badge?: string }[] = [
    { id: 'concept-generator', label: 'CONCEPT GENERATOR', badge: 'NEW' },
    { id: 'idea-generation', label: 'IDEA GENERATION', badge: 'GPT' },
    { id: 'edit', label: 'EDIT' },
    { id: '3d-render', label: '3D RENDER' },
    { id: 'enhancement', label: 'ENHANCEMENT', badge: 'NEW' },
    { id: 'png-to-dxf', label: 'PNG TO DXF' },
    { id: 'flythrough', label: 'FLYTHROUGH' },
    { id: 'vault', label: 'PROJECT VAULT', badge: 'NEW' },
    { id: 'presentation', label: 'DECK GENERATOR', badge: 'NEW' }
  ];

  const getInitialStage = (phase: string) => {
    if (phase === 'export') return 'concept-generator';
    if (phase === 'edit' || phase === 'measure' || phase === 'generate') return 'edit';
    return 'concept-generator';
  };

  const router = useRouter();

  // States
  const [activeMenuTab, setActiveMenuTab] = useState(() => getInitialStage(storePhase));
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [statusState, setStatusState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('Initializing bat-computer link...');
  const [welcomeGreeting, setWelcomeGreeting] = useState('Initializing bat-computer...');
  const [responseHtml, setResponseHtml] = useState<string | null>(null);
  const [isSoundMuted, setIsSoundMuted] = useState(true);
  const isSoundMutedRef = useRef(true); // Mirror of isSoundMuted for use inside async closures
  const [showStatusBlock, setShowStatusBlock] = useState(false);
  const [micDenied, setMicDenied] = useState(false); // mic permission denied
  const [isOffline, setIsOffline] = useState(false); // network offline
  const [isTabVisible, setIsTabVisible] = useState(true); // for animation pausing
  const [isClapEnabled, setIsClapEnabled] = useState(false); // clap-to-activate
  const [ttsUsingFallback, setTtsUsingFallback] = useState(false); // browser TTS fallback active
  const [marketMeta, setMarketMeta] = useState<{
    fetchedAt: string | null;
    marketOpen: boolean;
    marketNote: string;
    error?: string;
  }>({ fetchedAt: null, marketOpen: false, marketNote: '' });
  const [weatherFetchedAt, setWeatherFetchedAt] = useState<Date | null>(null);
  const isFirstMountRef = useRef(true);
  const chatHistoryRef = useRef<{ role: string, content: string }[]>([]);
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

  const [sessionCount, setSessionCount] = useState<string>('60TH WATCH');
  const [bootCompleted, setBootCompleted] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);

  useEffect(() => {
    // 60TH WATCH counter persistence
    let count = parseInt(localStorage.getItem('batman_watch_count') || '60', 10);
    if (isNaN(count)) count = 60;
    if (!sessionStorage.getItem('batman_session_incremented')) {
      count += 1;
      localStorage.setItem('batman_watch_count', count.toString());
      sessionStorage.setItem('batman_session_incremented', 'true');
    }
    const suffix = (c: number) => {
      const j = c % 10, k = c % 100;
      if (j === 1 && k !== 11) return 'ST';
      if (j === 2 && k !== 12) return 'ND';
      if (j === 3 && k !== 13) return 'RD';
      return 'TH';
    };
    setSessionCount(`${count}${suffix(count)} WATCH`);
  }, []);

  useEffect(() => {
    // Fast, skippable boot sequence
    const isDone = sessionStorage.getItem('batman_boot_done');
    if (isDone) {
      setBootCompleted(true);
    } else {
      const bootTimer = setTimeout(() => {
        setBootCompleted(true);
        sessionStorage.setItem('batman_boot_done', 'true');
      }, 1800);

      const handleSkip = () => {
        setBootCompleted(true);
        sessionStorage.setItem('batman_boot_done', 'true');
      };

      window.addEventListener('keydown', handleSkip);
      window.addEventListener('click', handleSkip);
      return () => {
        clearTimeout(bootTimer);
        window.removeEventListener('keydown', handleSkip);
        window.removeEventListener('click', handleSkip);
      };
    }
  }, []);

  useEffect(() => {
    // Command bar keyboard shortcut (Cmd+K / Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        commandInputRef.current?.focus();
        setShowCommandSuggestions(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
      setUptime(formatUptime(Date.now() - mountTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [mountTime]);

  const toggleSoundMute = () => {
    const newMuted = !isSoundMuted;
    setIsSoundMuted(newMuted);
    isSoundMutedRef.current = newMuted; // Keep ref in sync
    localStorage.setItem('home_sound_muted', newMuted ? 'true' : 'false');
    if (!newMuted) {
      playSonarPing();
    } else {
      // Instantly silence any playing audio
      if (currentAudioRef.current) {
        try { currentAudioRef.current.pause(); } catch (e) {}
        currentAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
      audioQueueRef.current = [];
      isPlayingAudioRef.current = false;
    }
  };

  useEffect(() => {
    const mutedPref = localStorage.getItem('home_sound_muted');
    const isMuted = mutedPref === null ? true : mutedPref === 'true';
    setIsSoundMuted(isMuted);
    isSoundMutedRef.current = isMuted; // Sync ref on mount

    // Restore clap preference
    const clapPref = localStorage.getItem('batman_clap_enabled');
    if (clapPref === 'true') setIsClapEnabled(true);

    const countStr = localStorage.getItem('batman_session_count');
    const currentCount = countStr ? parseInt(countStr, 10) + 1 : 1;
    localStorage.setItem('batman_session_count', currentCount.toString());
    
    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    setSessionCount(`${getOrdinal(currentCount)} watch`);

    const lastUsed = localStorage.getItem('last_used_tool');
    if (lastUsed) {
      setActiveMenuTab(lastUsed);
    }

    const now = new Date();
    const hour = now.getHours();
    const greetingText = getBatmanGreeting(hour);
    pendingGreetingRef.current = greetingText;

    const greetingTimer = setTimeout(() => {
      setWelcomeGreeting(greetingText);
      setTranscript("System ready. Click COMM LINK on the left to start.");
    }, 100);

    const audioTimer = setTimeout(() => {
      const alreadyPlayed = sessionStorage.getItem('boot_sound_played');
      if (!alreadyPlayed && !isMuted) {
        playSonarPing();
        sessionStorage.setItem('boot_sound_played', 'true');
      }
    }, 450);

    const statusTimer = setTimeout(() => {
      setShowStatusBlock(true);
    }, 850);

    return () => {
      clearTimeout(greetingTimer);
      clearTimeout(audioTimer);
      clearTimeout(statusTimer);
    };
  }, []);

  // Background music
  useEffect(() => {
    const audio = new Audio('/home page mp3/Batman Begins (OST) - Training.mp3.mpeg');
    audio.loop = true;
    audio.volume = 0.06;
    bgMusicRef.current = audio;

    const tryPlay = () => {
      audio.play().then(() => setIsMusicPlaying(true)).catch(() => { });
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

  // ── Offline & Visibility detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    
    const handleVisibility = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const res = await fetch('/api/stocks');
        const data = await res.json();
        if (res.ok && data.prices) {
          setMarketData(data.prices);
          marketDataRef.current = data.prices;
          setMarketMeta({
            fetchedAt: data.fetchedAt,
            marketOpen: data.marketOpen,
            marketNote: data.marketNote,
            error: undefined,
          });
        } else {
          // API returned error shape
          setMarketMeta(prev => ({
            ...prev,
            marketOpen: data.marketOpen ?? false,
            marketNote: data.marketNote ?? '',
            error: data.error || 'Market data unavailable.',
          }));
        }
      } catch (e) {
        setMarketMeta(prev => ({ ...prev, error: 'Market data unavailable.' }));
      }
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
          } catch (geoErr) { }
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

        const finalWeatherData = {
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
        };

        setWeatherData(finalWeatherData);
        setWeatherFetchedAt(new Date());
        localStorage.setItem('batman_weather_cache', JSON.stringify({
          data: finalWeatherData,
          timestamp: new Date().getTime()
        }));
        setWeatherLoading(false);
      } catch (err: any) {
        if (isMounted) {
          // Fall back to cache on error
          const cachedRaw = localStorage.getItem('batman_weather_cache');
          if (cachedRaw) {
            try {
              const cached = JSON.parse(cachedRaw);
              setWeatherData(cached.data);
              setWeatherFetchedAt(new Date(cached.timestamp));
              setWeatherError("Using cached data");
            } catch (e) {
              setWeatherError(err.message || "Weather Service Offline");
            }
          } else {
            setWeatherError(err.message || "Weather Service Offline");
          }
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
      hour >= 5 && hour < 12 ? 'morning' :
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
  const audioQueueRef = useRef<{audio: HTMLAudioElement, text: string}[]>([]);
  const isPlayingAudioRef = useRef(false);
  const audioSessionIdRef = useRef(0); // Tracks current queue session to prevent zombies
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef(false);
  const isSystemOnlineRef = useRef(true);
  const marketDataRef = useRef<Record<string, number> | null>(null);
  const newsDataRef = useRef<NewsArticle[] | null>(null);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  // Always points to the latest processCommand — avoids stale closure inside the recognition useEffect
  const processCommandRef = useRef<(cmd: string) => void>(() => { });

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

  // ── Clap Detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isClapEnabled) return;
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let microphone: MediaStreamAudioSourceNode;
    let dataArray: Uint8Array;
    let animationFrameId: number;
    let lastClapTime = 0;
    
    // Threshold tuning: requires a sharp volume spike.
    const CLAP_THRESHOLD = 200; // out of 255
    const DEBOUNCE_TIME = 800;  // ms between claps
    
    const initClapDetection = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2; // low smoothing for sharp transients
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const detectClap = () => {
          analyser.getByteTimeDomainData(dataArray as any);
          
          let maxVal = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const val = Math.abs(dataArray[i] - 128);
            if (val > maxVal) maxVal = val;
          }
          
          const now = Date.now();
          // Transform peak into a 0-255 amplitude roughly
          const amplitude = maxVal * 2;
          
          if (amplitude > CLAP_THRESHOLD && (now - lastClapTime > DEBOUNCE_TIME)) {
            lastClapTime = now;
            console.log('[ClapDetector] Clap detected! Amplitude:', amplitude);
            
            // Only trigger if system is idle (not currently listening/speaking)
            if (statusStateRef.current === 'idle') {
               // Simulate handleMicClick using the toggleSystem logic
               shouldListenRef.current = true;
               resetSleepTimer();
               startListening();
               setTranscript("Voice link active via CLAP. Start speaking...");
            } else if (statusStateRef.current === 'listening') {
               // A clap while listening could be used to STOP listening, or we just ignore.
               // Let's just ignore so it doesn't accidentally cancel a command in a noisy room.
            }
          }
          
          animationFrameId = requestAnimationFrame(detectClap);
        };
        
        detectClap();
      } catch (err) {
        console.warn('[ClapDetector] Failed to access mic for clap detection:', err);
      }
    };
    
    initClapDetection();
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (audioContext) audioContext.close();
    };
  }, [isClapEnabled]); // re-run if toggled

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
        } catch (e) { }
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
      
      if (event.error === 'not-allowed') {
        setMicDenied(true);
        setStatusState('idle');
        setTranscript('Mic access denied. Please enable microphone permissions in your browser.');
        isRunning = false;
        shouldListenRef.current = false;
        return;
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
      try { recognition.stop(); } catch (e) { }
      interruptSpeech();
    };
  }, []);

  const interruptSpeech = () => {
    audioSessionIdRef.current += 1; // Increment session so pending queue loops abort
    isAgentSpeakingRef.current = false;
    isStreamingRef.current = false;
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch (e) { }
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { }
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
      try { recognitionRef.current.stop(); } catch (e) { }
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

    // Look for natural sentence boundaries (. ? ! \n)
    // We strictly avoid splitting on commas or colons because splitting into tiny
    // audio chunks causes the browser to stutter/gap between playbacks.
    const boundaryMatch = trimmed.match(/[.?!]+(\s+|$)|(\n+)/);

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
      const rooms = (params.rooms && params.rooms.length > 0) ? params.rooms.join(', ') : 'None';
      const plotArea = params.plotArea;
      const orientation = params.orientation;
      const hasFloorPlan = !!store.currentFloorPlan;

      // Detect if user is asking for news/brief or stock prices — used to trigger fresh fetches
      const isBriefRequest = lowerCmd.includes('brief') || lowerCmd.includes('news') ||
        lowerCmd.includes('digest') || (lowerCmd.includes('what') && lowerCmd.includes('happen')) ||
        lowerCmd.includes('latest') || lowerCmd.includes('update') ||
        lowerCmd.includes('stock') || lowerCmd.includes('price') || lowerCmd.includes('shares');

      let marketStr = "Market data currently unavailable.";
      let currentMarketData = marketDataRef.current;

      // Re-fetch stocks fresh on every brief request for real-time prices
      if (isBriefRequest) {
        try {
          const freshStocksRes = await fetch(`/api/stocks?_t=${Date.now()}`);
          const data = await freshStocksRes.json();
          if (freshStocksRes.ok && data.prices) {
            currentMarketData = data.prices;
            marketDataRef.current = data.prices;
            setMarketMeta({
              fetchedAt: data.fetchedAt,
              marketOpen: data.marketOpen,
              marketNote: data.marketNote,
            });
          }
        } catch (e) {
          // Fall back to cached
        }
      }

      if (currentMarketData) {
        const stocksList = [
          { name: "Reliance Industries", sym: "RELIANCE.NS" },
          { name: "TCS", sym: "TCS.NS" },
          { name: "HDFC Bank", sym: "HDFCBANK.NS" },
          { name: "Apple", sym: "AAPL" },
          { name: "Google", sym: "GOOGL" },
          { name: "Microsoft", sym: "MSFT" },
          { name: "Amazon", sym: "AMZN" },
          { name: "Nvidia", sym: "NVDA" },
          { name: "Meta / Facebook", sym: "META" },
          { name: "Tesla", sym: "TSLA" },
          { name: "Netflix", sym: "NFLX" },
          { name: "AMD", sym: "AMD" },
          { name: "Intel", sym: "INTC" }
        ];
        
        let metaNotice = "";
        if (!marketMeta.marketOpen) {
           metaNotice = `[MARKET CLOSED - ${marketMeta.marketNote}] `;
        }
        if (marketMeta.fetchedAt && (Date.now() - new Date(marketMeta.fetchedAt).getTime() > 300000)) {
           metaNotice += `[STALE DATA - Fetched at: ${new Date(marketMeta.fetchedAt).toLocaleTimeString()}] `;
        }
        
        marketStr = (metaNotice ? `NOTE: ${metaNotice}\n` : `NOTE: [LIVE DATA - Fetched at: ${new Date(marketMeta.fetchedAt || Date.now()).toLocaleTimeString()}]\n`) + 
          stocksList
          .map(s => {
            const val = currentMarketData![s.sym];
            if (val === undefined) return `- ${s.name}: N/A`;
            // If it's an Indian stock, show ₹, else show $
            const currency = s.sym.endsWith('.NS') ? '₹' : '$';
            return `- ${s.name} (${s.sym}): ${currency}${val.toFixed(2)}`;
          })
          .join('\n');
      }

      let newsStr = "No architectural news available.";

      // If the user is asking for news/brief, always re-fetch fresh so Batman
      // gets a newly-shuffled pool and never repeats the same 3 stories.
      let newsSource = newsDataRef.current;
      if (isBriefRequest) {
        try {
          const freshRes = await fetch(`/api/architect-news?_t=${Date.now()}`);
          if (freshRes.ok) {
            const freshData = await freshRes.json();
            newsSource = freshData;
            newsDataRef.current = freshData; // update cache too
          }
        } catch (e) {
          // Fall back to cached if fetch fails
        }
      }

      if (newsSource && newsSource.length > 0) {
        newsStr = newsSource
          .map((item: any, idx: number) => `${idx + 1}. [${item.source}] ${item.title}\n   Summary: ${item.description}\n   Link: ${item.link}`)
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

BREAKING ARCHITECTURAL NEWS & DIGEST (freshly fetched — pick any 3, they are in random order):
${newsStr}
NOTE: Each time Master Umesh asks for the brief, these stories are shuffled randomly. Always pick a DIFFERENT combination of 3 stories than what you may have mentioned before. Never repeat the same story in the same session.`;

      // ── WEB SEARCH INJECTION ─────────────────────────────────────────────────
      // Smart Pre-flight check: Ask a fast 8B model if this query actually needs web data
      let needsWebSearch = false;
      if (!isBriefRequest) {
        try {
          const classRes = await fetch('/api/openai-classify-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMsg }),
            signal: AbortSignal.timeout(3000), // Very fast timeout, skip search if slow
          });
          if (classRes.ok) {
            const classData = await classRes.json();
            needsWebSearch = classData.needsSearch === true;
          }
        } catch (e) {
          console.warn('[Batman] Pre-flight search classification failed, defaulting to no search.');
        }
      }

      let webSearchContext = '';
      if (needsWebSearch) {
        try {
          console.log('[Batman] Running web search for:', userMsg);
          const searchRes = await fetch('/api/web-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userMsg }),
            signal: AbortSignal.timeout(10000),
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.answer || searchData.results?.length) {
              const snippets = (searchData.results || [])
                .map((r: any) => `• ${r.title}: ${r.content}`)
                .join('\n');
              webSearchContext = `\n\nWEB SEARCH RESULTS for "${userMsg}" (use this to answer accurately — do NOT say you don't have information):\nSummary: ${searchData.answer || 'No direct answer found.'}\nSources:\n${snippets}`;
              console.log('[Batman] Web search injected successfully.');
            }
          }
        } catch (e) {
          console.warn('[Batman] Web search failed silently, continuing without it:', e);
        }
      }

      const finalContextStr = contextStr + webSearchContext;

      isStreamingRef.current = true;

      fetchAbortControllerRef.current = new AbortController();

      const response = await fetch('/api/openai-chat', {
        signal: fetchAbortControllerRef.current.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemContext: finalContextStr,
          messages: [
            ...chatHistoryRef.current,
            { role: 'user', content: userMsg }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

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

              setResponseHtml(completeResponse);

              // Use our smart sentence/clause/word-count extractor to queue speaking early!
              let splitResult = extractSpeakableChunk(currentSentence);
              while (splitResult) {
                speakStreamedSentence(splitResult.chunk.trim());
                currentSentence = splitResult.remaining;
                splitResult = extractSpeakableChunk(currentSentence);
              }
            } catch (e) { }
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

            setResponseHtml(completeResponse);
          }
        } catch (e) { }
      }

      // Flush remaining text
      if (currentSentence.trim()) {
        speakStreamedSentence(currentSentence.trim());
      }

      chatHistoryRef.current = [...chatHistoryRef.current, { role: 'user', content: userMsg }, { role: 'assistant', content: completeResponse }].slice(-10);

    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("OpenAI stream aborted.");
        return;
      }
      console.error("OpenAI stream failed:", e);
      setResponseHtml(`<span style="color:#ff4444; font-family:monospace; font-size:12px;">SYSTEM ERROR: ${e.message}</span>`);
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

    setResponseHtml(res.greeting || res.message);
  };

  const processAudioQueue = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;

    isPlayingAudioRef.current = true;
    const currentSessionId = audioSessionIdRef.current;

    const { audio, text } = audioQueueRef.current.shift()!;

    setStatusState('speaking');
    isAgentSpeakingRef.current = true;

    try {
      currentAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        // Safety timeout: if audio hangs for any reason (network, Vercel edge, etc.),
        // force-resolve after 15s so the mic is NEVER permanently blocked
        const safetyTimer = setTimeout(() => {
          console.warn('[Batman Audio] Safety timeout fired — forcing resolve');
          try { audio.pause(); } catch (e) { } // Force pause so it doesn't resume randomly later
          if (bgMusicRef.current) bgMusicRef.current.volume = 0.06;
          resolve();
        }, 15000);

        const cleanup = () => {
          clearTimeout(safetyTimer);
          // Remove listeners to prevent memory leaks or rogue triggers
          audio.onended = null;
          audio.onerror = null;
          audio.onstalled = null;
          if (bgMusicRef.current) bgMusicRef.current.volume = 0.06;
          resolve();
        };

          const fallbackBrowserTTS = () => {
            console.warn('[Batman Audio] Falling back to browser TTS for:', text);
            setTtsUsingFallback(true);
            if (!window.speechSynthesis) return cleanup();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = cleanup;
            utterance.onerror = cleanup;
            window.speechSynthesis.speak(utterance);
          };

          // Duck background music while Batman speaks
          if (bgMusicRef.current) bgMusicRef.current.volume = 0.01;
          audio.onended = cleanup;
          audio.onerror = () => { 
            console.warn('[Batman Audio] onerror fired'); 
            fallbackBrowserTTS(); 
          };

          // DO NOT call cleanup() on onstalled! 
          // Stalled just means buffering. If we cleanup() here, it advances the queue,
          // but this audio will suddenly resume playing when it finishes buffering, causing overlapping voices!
          audio.onstalled = () => { console.warn('[Batman Audio] onstalled - buffering...'); };

          try {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.warn('[Batman Audio] play() rejected:', err.name, err.message);
                fallbackBrowserTTS();
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

    // If the session was interrupted while we were awaiting the audio, DO NOT proceed!
    // This absolutely prevents "zombie" promises from restarting the queue and causing overlapping voices.
    if (currentSessionId !== audioSessionIdRef.current) {
      console.log('[Batman Audio] Queue session was interrupted. Aborting queue loop.');
      return;
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

    if (isSoundMutedRef.current) {
      if (onComplete) onComplete();
      return;
    }

    // Create the Audio object immediately! The browser will start fetching the stream in the background
    // right now, so by the time the current audio finishes, this one is already fully buffered!
    const audioUrl = `/api/openai-tts?text=${encodeURIComponent(text)}`;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audio.volume = 1.0; // Batman's voice at full volume

    audioQueueRef.current.push({ audio, text });

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

  // ── SMART NAVIGATION INTENT DETECTOR ───────────────────────────────────────
  // This runs BEFORE calling the LLM — it catches the vast majority of navigation
  // commands instantly without burning tokens or waiting for a stream to complete.
  // Returns the route to navigate to, or null if it's not a navigation command.
  const detectNavigationIntent = (cmd: string): { tab: string; route: string; label: string } | null => {
    const t = cmd.toLowerCase().trim();

    // ── Render Zone / Projects ────────────────────────────────────────────────
    const renderZoneKws = [
      'render zone', 'renderzone', 'project archive', 'projects', 'my projects',
      'open project', 'view project', 'project section', 'project list', 'saved project',
      'open archive', 'go to archive', 'go to projects', 'take me to projects',
      'show me projects', 'show projects', 'project page', 'history', 'past projects',
    ];
    if (renderZoneKws.some(kw => t.includes(kw))) {
      return { tab: 'render-zone', route: '/projects', label: 'Accessing Project Archive' };
    }

    // ── Edit / Floor Plan Edit ────────────────────────────────────────────────
    const editKws = [
      'edit matrix', 'edit section', 'edit mode', 'edit page', 'edit floor',
      'floor plan edit', 'editing', 'open edit', 'go to edit', 'take me to edit',
      'let me edit', 'i want to edit', 'start editing', 'edit the plan',
      'edit my plan', 'modify plan', 'modify floor', 'change the plan',
    ];
    // exclude "edit credits" or "edit voice" etc from accidentally triggering
    const editExclusions = ['credit', 'voice', 'batman', 'profile', 'account'];
    if (editKws.some(kw => t.includes(kw)) && !editExclusions.some(ex => t.includes(ex))) {
      return { tab: 'edit', route: '/edit', label: 'Entering Edit Matrix' };
    }

    // ── Enhancement ────────────────────────────────────────────────────────
    const enhanceKws = [
      'enhance', 'enhancement', 'improve plan', 'improve my plan', 'clean up cad',
      'clean cad', 'enhance plan', 'enhance floor', 'enhancement section',
      'enhancement page', 'open enhancement'
    ];
    if (enhanceKws.some(kw => t.includes(kw))) {
      return { tab: 'enhancement', route: '/enhancement', label: 'Initiating Enhancement Studio' };
    }

    // ── 3D Render ────────────────────────────────────────────────────────────
    const render3dKws = [
      '3d render', '3d section', '3d visualization', '3d view', '3d model',
      'three d render', 'three d', '3d page', 'open 3d', 'go to 3d',
      'take me to 3d', 'show me 3d', 'let me see the 3d', 'do 3d',
      'render my plan', 'render section', 'render the plan', 'create render',
      'generate render', 'final render', 'visualize', 'visualization',
    ];
    if (render3dKws.some(kw => t.includes(kw))) {
      return { tab: '3d-render', route: '/3d-render', label: 'Initializing 3D Visualization' };
    }

    // ── Flythrough / Flightpath ───────────────────────────────────────────────
    const flythroughKws = [
      'flythrough', 'fly through', 'flightpath', 'flight path', 'fly path',
      'walkthrough', 'walk through', 'camera path', 'animation', 'animated view',
      'open flythrough', 'go to flythrough', 'show flythrough', 'take me to flythrough',
    ];
    if (flythroughKws.some(kw => t.includes(kw))) {
      return { tab: 'flythrough', route: '/flythrough', label: 'Loading Flightpath Module' };
    }

    // ── PNG to DXF / Vector ───────────────────────────────────────────────────
    const dxfKws = [
      'png to dxf', 'png dxf', 'dxf', 'vector', 'vectorize', 'to autocad',
      'export plan', 'export floor plan', 'export to autocad', 'open png',
      'open vector', 'convert to vector', 'convert to dxf', 'open dxf',
      'go to dxf', 'download dxf', 'cad file', 'autocad file',
    ];
    if (dxfKws.some(kw => t.includes(kw))) {
      return { tab: 'png-to-dxf', route: '/png-to-dxf', label: 'Initiating Vector Conversion Suite' };
    }

    // ── Beta / Vector Sandbox ─────────────────────────────────────────────────
    const betaKws = [
      'beta', 'vector sandbox', 'vector editor', 'svg editor', 'smart editor',
      'floor plan editor', 'open beta', 'go to beta', 'vector mode',
    ];
    if (betaKws.some(kw => t.includes(kw))) {
      return { tab: 'beta', route: '/vector-editor', label: 'Initializing Vector Sandbox Beta' };
    }

    return null;
  };

  // Keep processCommandRef in sync with the latest closure every render
  const processCommand = async (cmd: string) => {
    if (!isSystemOnlineRef.current) return;
    if (statusStateRef.current !== 'listening') {
      console.log(`[Command Processor] Ignored command "${cmd}" because state is: ${statusStateRef.current}`);
      return;
    }

    // CRITICAL FIX: Stop any currently speaking audio and abort any ongoing API streams
    // before processing the new command, preventing overlapping voice queues.
    interruptSpeech();

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

    // ── STEP 1: Smart Navigation Intent Detection (instant, no LLM needed) ───
    const navIntent = detectNavigationIntent(lowerCmd);
    if (navIntent) {
      setActiveMenuTab(navIntent.tab);
      if (navIntent.tab === 'edit' || navIntent.tab === '3d-render' || navIntent.tab === 'flythrough') {
        setStorePhase('edit');
      }
      const response = `${navIntent.label}, Master Umesh.`;
      if (navIntent.route && navIntent.route !== '/flythrough') {
        await speak(response, () => router.push(navIntent.route));
      } else {
        await speak(response);
      }
      return;
    }

    // ── STEP 2: Affirmation of a previous Batman suggestion ──────────────────
    const isAffirmative = ["yes", "sure", "do it", "please", "yeah", "yep", "ok", "okay", "go ahead", "confirm", "proceed"].some(word => lowerCmd.includes(word));
    if (isAffirmative) {
      const lastAssistantMsg = [...chatHistoryRef.current].reverse().find(msg => msg.role === 'assistant');
      if (lastAssistantMsg) {
        const contentStr = lastAssistantMsg.content.toLowerCase();
        // Use the same smart detector on what Batman last said to figure out what he was suggesting
        const suggestedIntent = detectNavigationIntent(contentStr);
        if (suggestedIntent) {
          setActiveMenuTab(suggestedIntent.tab);
          if (suggestedIntent.tab === 'edit' || suggestedIntent.tab === '3d-render' || suggestedIntent.tab === 'flythrough') {
            setStorePhase('edit');
          }
          const response = `${suggestedIntent.label}, Master Umesh.`;
          if (suggestedIntent.route && suggestedIntent.route !== '/flythrough') {
            await speak(response, () => router.push(suggestedIntent.route));
          } else {
            await speak(response);
          }
          return;
        }
      }
    }

    // ── STEP 3: Send to LLM for everything else ──────────────────────────────
    await callOpenAIAndStream(cmd);
  };

  // Sync processCommandRef on every render so the speech recognition closure always sees the latest version
  // eslint-disable-next-line react-hooks/exhaustive-deps
  processCommandRef.current = processCommand;

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      const lastUsed = localStorage.getItem('last_used_tool');
      if (lastUsed) {
        setActiveMenuTab(lastUsed);
        return;
      }
    }
    setActiveMenuTab(getInitialStage(storePhase));
  }, [storePhase]);

  const handleMenuClick = (stageId: string) => {
    if (statusState === 'speaking' || statusState === 'thinking') return; // Prevent double trigger
    setActiveMenuTab(stageId);
    localStorage.setItem('last_used_tool', stageId);

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
    } else if (stageId === 'enhancement') {
      speak("Initiating Enhancement Studio, Master Umesh.", () => {
        router.push('/enhancement');
      });
    } else if (stageId === 'png-to-dxf') {
      speak("Initiating vector conversion suite, Master Umesh.", () => {
        router.push('/png-to-dxf');
      });
    } else if (stageId === 'beta') {
      speak("Initializing Vector Sandbox Beta, Master Umesh.", () => {
        router.push('/vector-editor');
      });
    } else if (stageId === 'concept-generator') {
      speak("Initiating Concept Generator.", () => {
        router.push('/concept-generator');
      });
    } else if (stageId === 'idea-generation') {
      speak("Initiating generative idea suite, Master Umesh.", () => {
        router.push('/idea-generation');
      });
    } else if (stageId === 'flythrough') {
      setStorePhase('edit');
      speak("Flightpath parameters loaded, Master Umesh.");
    } else if (stageId === 'vault') {
      speak("Accessing project vault, Master Umesh.", () => {
        router.push('/vault');
      });
    } else if (stageId === 'presentation') {
      speak("Opening deck generator, Master Umesh.", () => {
        router.push('/presentation');
      });
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0a0a0f] flex flex-col items-center justify-center font-mono overflow-hidden z-50 text-batman-white">
      
      {/* --- HARDENING ALERTS --- */}
      {isOffline && (
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-amber-500 text-black font-bold text-center py-1 text-xs uppercase tracking-widest pointer-events-none shadow-[0_0_15px_rgba(245,158,11,0.5)]">
          ⚡ OFFLINE — showing last known data
        </div>
      )}
      {micDenied && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white font-bold text-center py-1.5 text-xs uppercase tracking-widest shadow-[0_0_15px_rgba(220,38,38,0.5)] pointer-events-auto cursor-pointer"
             onClick={() => { setMicDenied(false); alert("Please allow microphone access in your browser settings (usually the lock icon next to the URL), then reload."); }}>
          ⚠️ MIC ACCESS DENIED — CLICK TO ENABLE
        </div>
      )}
      {ttsUsingFallback && (
        <div className="fixed top-[150px] left-1/2 -translate-x-1/2 z-20 flex items-center bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded px-2 py-1 text-[9px] pointer-events-none">
          BROWSER TTS ACTIVE
        </div>
      )}

      <div className="vignette-overlay pointer-events-none absolute inset-0 z-0" />
      <div className="tech-grid pointer-events-none absolute inset-0 z-0 opacity-20" />

      {/* Video Background Stage (mimics object-fit: cover for 16:9 video) */}
      <div 
        className="bat-stage-container z-0 opacity-80 pointer-events-none"
        style={{
          ['--eye-top' as any]: '31.0%',
          ['--eye-left-x' as any]: '46.6%',
          ['--eye-right-x' as any]: '51.6%',
          ['--eye-w' as any]: '4.5%',
          ['--eye-h' as any]: '0.9%',
          ['--eye-tilt' as any]: '6deg',
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          src="/start video/start.mp4"
        />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_transparent_0%,_#0a0a0f_90%)] z-0 pointer-events-none" />

        {/* Left Eye */}
        <div 
          className={`absolute transition-all duration-500 ${statusState !== 'idle' ? 'eyes--active' : 'bat-eye-idle-anim'}`}
          style={{
            top: 'var(--eye-top)',
            left: 'var(--eye-left-x)',
            width: 'var(--eye-w)',
            height: 'var(--eye-h)',
            transform: 'rotate(calc(-1 * var(--eye-tilt)))',
          }}
        >
          <div className="bat-eye" />
        </div>

        {/* Right Eye */}
        <div 
          className={`absolute transition-all duration-500 ${statusState !== 'idle' ? 'eyes--active' : 'bat-eye-idle-anim'}`}
          style={{
            top: 'var(--eye-top)',
            left: 'var(--eye-right-x)',
            width: 'var(--eye-w)',
            height: 'var(--eye-h)',
            transform: 'rotate(var(--eye-tilt)) scaleX(-1)',
          }}
        >
          <div className="bat-eye" />
        </div>
      </div>

      {/* Central Bat-Signal Ring */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 w-[420px] h-[420px] flex items-center justify-center pointer-events-none select-none opacity-40">
        <svg className="w-full h-full absolute" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="3.5" strokeDasharray="3, 10" className="animate-[spin_20s_linear_infinite]" style={{ transformOrigin: '200px 200px', animationPlayState: isTabVisible ? 'running' : 'paused' }} />
          <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(0, 240, 255, 0.15)" strokeWidth="2" strokeDasharray="6, 16" className="animate-[spin_15s_linear_infinite_reverse]" style={{ transformOrigin: '200px 200px', animationPlayState: isTabVisible ? 'running' : 'paused' }} />
          <circle cx="200" cy="200" r="135" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="1" />
        </svg>
      </div>

      {/* Top Center: Clock Panel */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3.5 pointer-events-none select-none">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="2.5" />
            <motion.circle
              cx="24" cy="24" r="19" fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeDasharray="119.3"
              initial={{ strokeDashoffset: 119.3 }}
              animate={{ strokeDashoffset: 119.3 - (currentDate.getSeconds() / 60) * 119.3 }}
              transition={{ ease: "linear", duration: 0.2 }}
              className="drop-shadow-[0_0_4px_#00f0ff]"
            />
          </svg>
          <span className="absolute text-[9px] font-mono text-cyan-400 font-bold">
            {currentDate.getSeconds().toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-rajdhani text-2xl font-bold tracking-[2px] text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
              {currentDate.getHours().toString().padStart(2, '0')}:{currentDate.getMinutes().toString().padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono text-cyan-500/70 uppercase tracking-[1px] font-bold">
              {currentDate.toLocaleDateString([], { weekday: 'short' })}
            </span>
          </div>
          <span className="text-[9.5px] font-mono text-cyan-500/90 tracking-[1.5px] uppercase -mt-1 font-semibold">
            {currentDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Top Center: Watch / Session Status Bar (Stacked cleanly below clock) */}
      <div className="fixed top-[74px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-[#040814]/90 backdrop-blur-xl border border-cyan-500/30 rounded-full px-4 py-1 pointer-events-auto select-none font-mono text-[10px] shadow-[0_0_20px_rgba(0,240,255,0.15)]">
        <span className="text-cyan-400 font-bold tracking-[1.5px] uppercase">
          {sessionCount || '60TH WATCH'}
        </span>
        <span className="h-3 w-px bg-cyan-500/30" />
        <span className="text-cyan-500/80 tracking-[1px] uppercase font-semibold">
          RESUMING: {lastToolLabelMap[activeMenuTab] || 'CONCEPT GENERATOR'}
        </span>
        <span className="h-3 w-px bg-cyan-500/30" />
        {/* Speaker Mute/Unmute Toggle */}
        <button
          onClick={toggleSoundMute}
          className="text-cyan-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
          title={isSoundMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isSoundMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        <span className="h-3 w-px bg-cyan-500/30" />
        {/* Clap Toggle */}
        <button
          onClick={() => {
            const newVal = !isClapEnabled;
            setIsClapEnabled(newVal);
            localStorage.setItem('batman_clap_enabled', newVal ? 'true' : 'false');
          }}
          className={`transition-colors flex items-center justify-center cursor-pointer ${isClapEnabled ? 'text-green-400' : 'text-cyan-400/50 hover:text-cyan-400'}`}
          title={isClapEnabled ? 'Clap Detection: ON' : 'Clap Detection: OFF'}
        >
          <HandMetal size={12} />
        </button>
      </div>

      {/* Weather-Reactive Background Atmosphere */}
      {weatherData && (weatherData.condition.toLowerCase().includes('rain') || weatherData.condition.toLowerCase().includes('storm') || weatherData.condition.toLowerCase().includes('drizzle') || weatherData.condition.toLowerCase().includes('shower')) && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30 select-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,240,255,0.08)_100%)] animate-pulse" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(105deg,transparent,transparent_20px,rgba(0,240,255,0.12)_21px,transparent_22px)] bg-[length:200%_200%] animate-[rain_0.8s_linear_infinite]" />
        </div>
      )}

      {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}

      {/* LEFT TOP: Tactical Weather Metrics Panel */}
      <div className="fixed top-5 left-6 z-20 w-80 select-none pointer-events-auto bg-[#040814]/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,240,255,0.15)] relative overflow-hidden max-h-[36vh] overflow-y-auto">
        <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
        <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
        <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

        <div className="flex flex-col gap-2.5">
          <div className="border-b border-cyan-500/20 pb-2">
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase block text-left font-mono font-bold">TACTICAL METRICS</span>
            <div className="flex justify-between items-center">
              <h3 className="font-rajdhani text-[15px] font-bold text-cyan-400 tracking-[1px] uppercase truncate text-left">
                {weatherLoading ? "FETCHING DATA..." : weatherError ? "SERVICE OFFLINE" : weatherData?.location}
              </h3>
              {weatherFetchedAt && (Date.now() - weatherFetchedAt.getTime() > 1800000) && (
                <span className="text-[8px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded tracking-widest font-bold">STALE</span>
              )}
            </div>
          </div>
          {weatherLoading ? (
            <div className="py-4 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              <span className="text-[9px] text-cyan-500/60 tracking-[1.5px] uppercase font-mono">ANALYZING GEOLOCATION...</span>
            </div>
          ) : weatherError ? (
            <div className="py-3 flex flex-col items-center justify-center gap-1.5 text-center">
              <span className="text-xl">⚠️</span>
              <span className="text-[10px] text-cyan-400 font-bold tracking-[2px] uppercase font-mono">WEATHER OFFLINE</span>
            </div>
          ) : weatherData ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-rajdhani text-3xl font-bold tracking-tight text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                  {weatherData.temp}°C
                </span>
                <div className="text-right">
                  <span className="text-cyan-400 font-bold block uppercase tracking-[1px] text-[11px]">{weatherData.condition}</span>
                  <span className="text-[9px] text-cyan-500/60 uppercase block font-mono">Feels Like: {weatherData.feelsLike}°C</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-b border-cyan-500/20 py-2 my-0.5 text-[9.5px] font-mono">
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Humidity:</span><span className="text-cyan-400 font-bold">{weatherData.humidity}%</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Wind:</span><span className="text-cyan-400 font-bold truncate max-w-[55px]">{weatherData.windSpeed} km/h</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Pressure:</span><span className="text-cyan-400 font-bold">{weatherData.pressure} mb</span></div>
                <div className="flex justify-between"><span className="text-cyan-500/50 uppercase">Moon:</span><span className="text-cyan-400 font-bold">{weatherData.moonPhase.icon} {weatherData.moonPhase.phase.split(" ")[0]}</span></div>
              </div>
              <div className="flex flex-col gap-1 pt-0.5 text-left">
                <span className="text-[8.5px] tracking-[2px] text-cyan-500/60 uppercase mb-0.5 font-bold font-mono">3-DAY FORECAST</span>
                {weatherData.forecast.map((day, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[9.5px] bg-white/[0.03] px-2 py-1 rounded border border-cyan-500/10 font-mono">
                    <span className="text-cyan-400 font-bold uppercase text-[8.5px]">{day.day}</span>
                    <span className="text-cyan-500/60 uppercase truncate max-w-[80px] text-right text-[8.5px]">{day.condition}</span>
                    <span className="text-cyan-400 font-bold font-mono text-[9.5px] text-right">{day.tempMax}° / {day.tempMin}°</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* LEFT MIDDLE: Voice Assistant Panel ("TALK TO BATMAN" + COMM LINK) */}
      <div className="fixed left-6 top-[48%] -translate-y-1/2 z-20 w-80 select-none text-left hidden md:block">
        <div className="relative p-4 backdrop-blur-xl bg-[#040814]/85 border border-cyan-500/30 rounded-2xl shadow-[0_0_30px_rgba(0,240,255,0.15)] overflow-hidden">
          <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
          <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
          <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
          <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

          <div className="flex flex-col gap-1 mb-4">
            <span className="text-[9px] tracking-[4px] text-cyan-500/70 uppercase font-mono font-bold block">
              BAT-ASSISTANT
            </span>
            <h2 className="font-rajdhani text-xl font-bold tracking-[2px] text-white uppercase drop-shadow-[0_0_6px_rgba(0,240,255,0.3)]">
              TALK TO BATMAN
            </h2>
          </div>

          <div className="flex flex-col gap-3 font-mono text-sm tracking-[2px] uppercase">
            <button
              onClick={handleMicClick}
              className={`w-full py-2.5 px-3.5 rounded-lg border uppercase tracking-wider font-bold text-[10px] transition-all duration-300 flex items-center justify-between group cursor-pointer ${statusState === 'listening'
                  ? 'border-[#00f0ff] bg-[#00f0ff]/15 text-[#00f0ff] shadow-[0_0_15px_#00f0ff]'
                  : statusState === 'speaking'
                    ? 'border-[#5bc8af] bg-[#5bc8af]/15 text-[#5bc8af] shadow-[0_0_15px_#5bc8af]'
                    : 'border-cyan-500/30 bg-cyan-950/20 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-500/10'
                }`}
            >
              <Mic size={14} className={statusState === 'listening' ? 'animate-bounce text-[#00f0ff]' : ''} />
              <span>
                {statusState === 'listening' ? 'LINK_ACTIVE' :
                  statusState === 'speaking' ? 'TRANSMITTING' :
                    'COMM LINK'}
              </span>
            </button>

            {statusState === 'speaking' && (
              <button
                onClick={(e) => { e.stopPropagation(); interruptSpeech(); }}
                className="w-full py-2 px-3 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 uppercase tracking-wider font-bold text-[10px] transition-all duration-300 flex items-center justify-center cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.2)]"
              >
                STOP TALKING
              </button>
            )}

            {/* Waveform indicator */}
            <div className="flex items-center gap-1.5 h-6 pl-1 mt-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={`hud-wave-${i}`}
                  className={`w-[3px] rounded transition-all duration-100 ${statusState === 'listening' ? 'bg-[#00f0ff] animate-pulse' :
                      statusState === 'speaking' ? 'bg-[#5bc8af] animate-pulse' :
                        'bg-cyan-900/40 h-1'
                    }`}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    height: (statusState === 'listening' || statusState === 'speaking') ? `${[6, 14, 8, 16, 10, 18, 11, 7, 13, 5][i]}px` : '4px'
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* LEFT BOTTOM: Real Command Bar with Module Launcher (Cmd+K) */}
      <div className="fixed bottom-6 left-6 z-30 w-80 select-text pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <input
            ref={commandInputRef}
            type="text"
            placeholder="COMMAND BAR (CMD+K)..."
            value={searchQuery}
            onFocus={() => setShowCommandSuggestions(true)}
            onBlur={() => setTimeout(() => setShowCommandSuggestions(false), 200)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowCommandSuggestions(true);
            }}
            className="w-full bg-[#040814]/90 hover:bg-[#040814] focus:bg-[#040814] border border-cyan-500/40 focus:border-cyan-400 focus:outline-none rounded-xl px-3.5 py-2.5 pl-9 text-[11px] font-mono text-cyan-300 placeholder-cyan-500/50 transition-all duration-300 tracking-[1.5px] uppercase backdrop-blur-xl shadow-[0_0_20px_rgba(0,240,255,0.15)]"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 group-focus-within:text-cyan-300 transition-colors" />

          {/* Module Fuzzy Search Dropdown */}
          {showCommandSuggestions && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#040814]/95 border border-cyan-500/40 rounded-xl p-2 shadow-[0_0_30px_rgba(0,240,255,0.25)] backdrop-blur-xl max-h-60 overflow-y-auto font-mono text-[10px]">
              <div className="px-2 py-1 text-[8px] tracking-[2px] text-cyan-500/50 uppercase border-b border-cyan-500/20 mb-1 font-bold">
                JUMP TO MODULE
              </div>
              {startScreenStages
                .filter(stage => 
                  !searchQuery || 
                  stage.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  stage.id.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((stage) => (
                  <button
                    key={`cmd-${stage.id}`}
                    type="button"
                    onMouseDown={() => handleMenuClick(stage.id)}
                    className="w-full text-left px-2.5 py-2 rounded hover:bg-cyan-500/20 text-cyan-300 hover:text-white flex items-center justify-between transition-colors uppercase tracking-wider font-bold"
                  >
                    <span>▶ {stage.label}</span>
                    {stage.badge && (
                      <span className="text-[8px] bg-cyan-400 text-black font-bold px-1 rounded">
                        {stage.badge}
                      </span>
                    )}
                  </button>
                ))}
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={handleSearchSubmit}
                  className="w-full text-left px-2.5 py-2 mt-1 border-t border-cyan-500/20 rounded hover:bg-cyan-500/20 text-cyan-400 hover:text-white flex items-center justify-between transition-colors uppercase tracking-wider font-bold"
                >
                  <span>🔍 SEARCH WEB: "{searchQuery}"</span>
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}

      {/* RIGHT TOP: System Toggle */}
      <div className="fixed top-5 right-6 flex items-center justify-between w-[220px] bg-[#040814]/85 backdrop-blur border border-cyan-500/30 rounded-xl px-4 py-2 z-20 shadow-[0_0_20px_rgba(0,240,255,0.1)]">
        <span className="text-[10px] tracking-widest text-cyan-400 uppercase font-bold font-mono">BAT-ASSISTANT</span>
        <button
          onClick={toggleSystem}
          className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] tracking-wider transition-all font-mono font-bold ${isSystemOnline ? 'border border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/5 shadow-[0_0_10px_rgba(0,240,255,0.2)]' : 'border border-red-500 text-red-500 bg-red-500/5'}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isSystemOnline ? 'bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]' : 'bg-red-500'}`} />
          {isSystemOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
      </div>

      {/* RIGHT MIDDLE: System Interface / Main Menu */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20 w-80 select-none text-left hidden md:block">
        <div className="relative p-5 backdrop-blur-xl bg-[#040814]/85 border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(0,240,255,0.15)] overflow-hidden">
          
          <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
          <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
          <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
          <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,240,255,0.025)_50%)] bg-[length:100%_4px] pointer-events-none" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-cyan-500/20 via-[#00f0ff] to-cyan-500/20 shadow-[0_0_12px_#00f0ff] pointer-events-none" />

          {/* Header section */}
          <div className="flex flex-col gap-1.5 mb-4 pb-3 border-b border-cyan-500/20 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[3px] text-cyan-400/70 font-mono font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-ping" />
                SYSTEM INTERFACE
              </span>
              <span className="text-[9px] font-mono text-cyan-500/50 tracking-wider">SYS.09</span>
            </div>
            <h2 
              className="text-2xl font-black tracking-[3px] text-white uppercase drop-shadow-[0_0_10px_rgba(0,240,255,0.5)] flex items-center justify-between" 
              style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}
            >
              MAIN MENU
              <span className="text-[10px] text-cyan-400/40 font-mono font-normal">v2.4</span>
            </h2>
          </div>

          {/* Stage list */}
          <div className="flex flex-col gap-1.5 relative z-10 font-mono">
            {startScreenStages.map((stage, idx) => {
              const isActive = activeMenuTab === stage.id;
              const isHovered = hoveredStage === stage.id;
              const indexStr = (idx + 1).toString().padStart(2, '0');

              return (
                <button
                  key={stage.id}
                  onClick={() => {
                    playSonarPing();
                    handleMenuClick(stage.id);
                  }}
                  onMouseEnter={() => {
                    setHoveredStage(stage.id);
                    playMenuHoverSound();
                  }}
                  onMouseLeave={() => setHoveredStage(null)}
                  className={`relative flex items-center justify-between w-full px-3 py-2 rounded-lg transition-all duration-200 group text-left cursor-pointer overflow-hidden border ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/30 via-cyan-500/15 to-transparent border-cyan-400/80 shadow-[0_0_15px_rgba(0,240,255,0.35)] translate-x-1.5'
                      : isHovered
                      ? 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)] translate-x-1'
                      : 'bg-transparent border-transparent hover:border-cyan-500/20'
                  }`}
                >
                  <div 
                    className={`absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-200 ${
                      isActive 
                        ? 'bg-[#00f0ff] shadow-[0_0_10px_#00f0ff]' 
                        : isHovered 
                        ? 'bg-cyan-400/80 shadow-[0_0_6px_#00f0ff]' 
                        : 'bg-transparent'
                    }`} 
                  />

                  <div className="flex items-center gap-2.5 z-10">
                    <span 
                      className={`text-xs font-bold transition-all duration-200 ${
                        isActive
                          ? 'text-[#00f0ff] scale-110 drop-shadow-[0_0_6px_#00f0ff]'
                          : isHovered
                          ? 'text-cyan-400 translate-x-0.5'
                          : 'text-cyan-600/40 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      ▶
                    </span>
                    
                    <span className={`text-[10px] font-mono tracking-tighter ${isActive || isHovered ? 'text-cyan-400 font-bold' : 'text-cyan-500/40'}`}>
                      {indexStr}
                    </span>

                    <span 
                      className={`text-xs font-bold tracking-[1.5px] uppercase transition-all duration-200 ${
                        isActive
                          ? 'text-white drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]'
                          : isHovered
                          ? 'text-cyan-100 drop-shadow-[0_0_4px_rgba(0,240,255,0.4)]'
                          : 'text-cyan-400/70 group-hover:text-white'
                      }`}
                      style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {stage.badge && (
                    <span
                      className={`text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider uppercase transition-all duration-200 z-10 ${
                        stage.badge === 'NEW'
                          ? isActive || isHovered
                            ? 'bg-[#00f0ff] text-black shadow-[0_0_8px_rgba(0,240,255,0.8)] border border-cyan-300'
                            : 'bg-cyan-950/80 text-[#00f0ff] border border-cyan-400/50 shadow-[0_0_6px_rgba(0,240,255,0.3)] animate-pulse'
                          : isActive || isHovered
                          ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.8)] border border-purple-300'
                          : 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                      }`}
                    >
                      {stage.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between text-[8px] font-mono text-cyan-500/50 uppercase tracking-widest relative z-10">
            <span>COMMAND MATRIX</span>
            <span className="text-cyan-400 font-bold animate-pulse">● ACTIVE</span>
          </div>

        </div>
      </div>

      {/* ── CENTER COLUMN (LOWER AREA) ──────────────────────────────────── */}

      {/* BAT-ASSISTANT RESPONSE HUD STRIP (Floating above bottom log) */}
      {responseHtml && (
        <div
          className="fixed bottom-[135px] left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
          style={{ width: 'min(460px, 90vw)' }}
        >
          <div className="
            relative
            bg-[#040814]/90 backdrop-blur-xl
            border border-cyan-500/40
            rounded-xl
            px-5 py-3
            shadow-[0_0_30px_rgba(0,240,255,0.2)]
            font-mono
          ">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 rounded-tl-xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 rounded-tr-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 rounded-bl-xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 rounded-br-xl pointer-events-none" />

            <div className="text-[9px] tracking-[3px] text-cyan-400 font-bold uppercase font-mono mb-1 flex items-center justify-between">
              <span>BAT-ASSISTANT</span>
              <span className="text-[8px] text-cyan-500/50">COMMS ACTIVE</span>
            </div>

            <div
              className="text-[12.5px] leading-relaxed text-cyan-100 font-mono overflow-y-auto"
              style={{ maxHeight: '5.5rem' }}
            >
              {responseHtml}
            </div>
          </div>
        </div>
      )}

      {/* Center Column Bottom Container: Greeting + Voice Status + YOU SAID input log */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full max-w-md px-4 pointer-events-auto">
        {/* Welcome Greeting Display */}
        {welcomeGreeting && (
          <div className="w-full text-center mb-3 animate-fadeIn font-serif font-bold text-white text-xl md:text-2xl tracking-normal leading-snug drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            {welcomeGreeting}
          </div>
        )}

        {/* Status Label */}
        <div className={`text-[9.5px] tracking-[3px] font-mono uppercase mb-2 h-4 transition-colors ${statusState === 'listening' ? 'text-[#00f0ff] font-bold' : statusState === 'thinking' ? 'text-amber-400 font-bold' : statusState === 'speaking' ? 'text-[#5bc8af] font-bold' : 'text-cyan-500/50'}`}>
          {statusState === 'listening' ? 'listening...' :
            statusState === 'thinking' ? 'processing...' :
              statusState === 'speaking' ? 'speaking...' :
                'voice interface idle'}
        </div>

        {/* YOU SAID Panel */}
        <div className="w-full bg-[#040814]/85 backdrop-blur-md border border-cyan-500/30 rounded-xl p-3.5 shadow-[0_0_20px_rgba(0,240,255,0.12)] font-mono">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] font-bold tracking-[2px] text-cyan-400 uppercase">
              YOU SAID
            </span>
            <span className="text-[8px] text-cyan-500/50 uppercase">INPUT LOG</span>
          </div>
          <div className="text-[12.5px] text-cyan-100 font-sans font-semibold">
            {transcript || "Waiting for command..."}
          </div>
        </div>

      </div>

      {/* System Uptime Counter (Bottom Center) */}
      <div className="fixed bottom-1.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none text-center font-mono">
        <span className="text-[8px] tracking-[3px] text-cyan-500/50 uppercase font-bold">
          SESSION UPTIME: <span className="text-cyan-400">{uptime}</span>
        </span>
      </div>

    </div>
  );
}
