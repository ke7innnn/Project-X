'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
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

  const startScreenStages = [
    { id: 'concept', label: 'CONCEPT' },
    { id: 'edit', label: 'EDIT' },
    { id: 'autocad', label: 'AUTOCAD', badge: 'NEW' },
    { id: '3d-render', label: '3D RENDER' },
    { id: 'flythrough', label: 'FLYTHROUGH' }
  ];

  const getInitialStage = (phase: string) => {
    if (phase === 'export') return 'autocad';
    if (phase === 'edit' || phase === 'measure' || phase === 'generate') return 'edit';
    return 'concept';
  };

  // States
  const [activeMenuTab, setActiveMenuTab] = useState(() => getInitialStage(storePhase));
  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [statusState, setStatusState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('—');
  const [responseHtml, setResponseHtml] = useState<React.ReactNode>(null);
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  
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

  // Refs
  const recognitionRef = useRef<any>(null);
  const isAgentSpeakingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentSpokenTextRef = useRef('');
  const shouldListenRef = useRef(true);
  const statusStateRef = useRef<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');

  // Clap Detection Refs
  const clapAudioContextRef = useRef<AudioContext | null>(null);
  const clapStreamRef = useRef<MediaStream | null>(null);
  const clapAnimationRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<string | null>(null);

  // Keep state sync for callbacks
  const handleClapDetected = async () => {
    if (!isSystemOnline) return;
    
    interruptSpeech();
    setStatusState('speaking');
    
    const hours = new Date().getHours();
    let timeOfDay = "morning";
    if (hours >= 12 && hours < 17) timeOfDay = "afternoon";
    else if (hours >= 17) timeOfDay = "evening";

    const welcomeGreeting = `Good ${timeOfDay}, Umesh. The city needs its architect. Shall we begin?`;
    
    setTranscript("[Double Clap Detected] Waking up...");
    setResponseHtml(null);
    pendingUpdatesRef.current = null;

    // Start fetching telemetry updates in the background
    const store = useArchitectStore.getState();
    const phase = store.phase;
    const params = store.collectedParameters;
    const rooms = params.rooms.length > 0 ? params.rooms.join(', ') : 'None';
    const plotArea = params.plotArea;
    const orientation = params.orientation;
    const hasFloorPlan = !!store.currentFloorPlan;

    const query = `Give me a time-of-day greeting for ${timeOfDay} and system updates of the app based on:
- Phase: ${phase}
- Plot Area: ${plotArea ? plotArea + ' sq ft' : 'not configured'}
- Orientation: ${orientation || 'not configured'}
- Rooms: ${rooms}
- Floor Plan: ${hasFloorPlan ? 'Generated' : 'Not generated yet'}`;

    callBatmanAI(query, true)
      .then((res) => {
        if (res) {
          res.greeting = welcomeGreeting;
          renderResponse(res);
          if (res.message) {
            pendingUpdatesRef.current = res.message;
            // If the welcome greeting has already finished speaking, trigger updates speech
            if (!isAgentSpeakingRef.current) {
              speak(res.message);
            }
          }
        } else {
          handleOfflineClapFallback(welcomeGreeting);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch background telemetry updates:", err);
        handleOfflineClapFallback(welcomeGreeting);
      });

    // Speak the welcome greeting immediately (offline-friendly)
    speak(welcomeGreeting, () => {
      // Callback triggered when welcome greeting finishes speaking
      if (pendingUpdatesRef.current) {
        const nextSpeech = pendingUpdatesRef.current;
        pendingUpdatesRef.current = null;
        speak(nextSpeech);
      }
    });
  };

  const handleOfflineClapFallback = (welcomeGreeting: string) => {
    renderResponse({
      greeting: welcomeGreeting,
      brief: [
        { key: "System Status", val: "ONLINE" },
        { key: "Telemetry", val: "OFFLINE" }
      ]
    });
    if (!isAgentSpeakingRef.current) {
      speak("Telemetry updates are offline, sir.");
    } else {
      pendingUpdatesRef.current = "Telemetry updates are offline, sir.";
    }
  };

  const startClapDetection = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      clapStreamRef.current = stream;
      
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      clapAudioContextRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastPeakTime = 0;
      let lastClapTime = 0;
      let averageVolume = 0.05;

      const checkAudio = () => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const value = (dataArray[i] - 128) / 128;
          sum += value * value;
          const absVal = Math.abs(value);
          if (absVal > peak) peak = absVal;
        }
        
        const rms = Math.sqrt(sum / dataArray.length);
        averageVolume = averageVolume * 0.95 + rms * 0.05;
        
        const now = Date.now();
        if (peak > 0.4 && peak > averageVolume * 4.0) {
          if (now - lastPeakTime > 200) {
            lastPeakTime = now;
            if (lastClapTime > 0 && now - lastClapTime >= 150 && now - lastClapTime <= 1000) {
              lastClapTime = 0;
              handleClapDetected();
            } else {
              lastClapTime = now;
            }
          }
        }
        
        clapAnimationRef.current = requestAnimationFrame(checkAudio);
      };
      
      clapAnimationRef.current = requestAnimationFrame(checkAudio);
    } catch (err) {
      console.warn("Clap detection mic access denied or not supported:", err);
    }
  };

  const resumeClapContext = () => {
    if (clapAudioContextRef.current && clapAudioContextRef.current.state === 'suspended') {
      clapAudioContextRef.current.resume();
    }
  };

  useEffect(() => {
    statusStateRef.current = statusState;
  }, [statusState]);

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const result = event.results[current];
        const text = result[0].transcript;
        if (result.isFinal) {
          processCommand(text);
        }
      };
      
      recognition.onend = () => {
        if (shouldListenRef.current && statusStateRef.current !== 'thinking' && statusStateRef.current !== 'speaking') {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;
    }

    // Start clap detection
    startClapDetection();
    window.addEventListener('click', resumeClapContext);

    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }
      interruptSpeech();

      // Clean up clap detection
      if (clapAnimationRef.current) {
        cancelAnimationFrame(clapAnimationRef.current);
      }
      if (clapStreamRef.current) {
        clapStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (clapAudioContextRef.current) {
        clapAudioContextRef.current.close().catch(() => {});
      }
      window.removeEventListener('click', resumeClapContext);
    };
  }, []);

  const interruptSpeech = () => {
    isAgentSpeakingRef.current = false;
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
    if (recognitionRef.current && shouldListenRef.current) {
       try { recognitionRef.current.start(); } catch (e) {}
       setStatusState('listening');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
       try { recognitionRef.current.stop(); } catch (e) {}
    }
    setStatusState('idle');
  };

  const toggleSystem = () => {
    resumeClapContext();
    if (shouldListenRef.current) {
      setIsSystemOnline(false);
      shouldListenRef.current = false;
      stopListening();
    } else {
      setIsSystemOnline(true);
      shouldListenRef.current = true;
      startListening();
    }
  };

  const handleMicClick = () => {
    resumeClapContext();
    if (statusState === 'listening') {
      shouldListenRef.current = false;
      stopListening();
    } else {
      shouldListenRef.current = true;
      startListening();
    }
  };

  const getFormattedDate = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const getFormattedTime = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

  const extractJSON = (str: string) => {
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(str.substring(start, end + 1));
      } catch (e) {
        console.log("Failed to parse extracted JSON:", e);
      }
    }
    throw new Error("No valid JSON found in response");
  };  const callBatmanAI = async (userMsg: string, isJarvisHype: boolean = false) => {
    // Hidden command to enter the main app
    const lowerCmd = userMsg.toLowerCase().trim();
    if (lowerCmd.includes("enter system") || lowerCmd.includes("start the application") || lowerCmd.includes("open the app")) {
      return { type: "chat", message: "Entering the Architect System, sir." };
    }

    const store = useArchitectStore.getState();
    const phase = store.phase;
    const params = store.collectedParameters;
    const rooms = params.rooms.length > 0 ? params.rooms.join(', ') : 'None';
    const plotArea = params.plotArea;
    const orientation = params.orientation;
    const hasFloorPlan = !!store.currentFloorPlan;

    const systemPrompt = isJarvisHype 
      ? `You are J.A.R.V.I.S. - the legendary, ultra-advanced AI system created by Tony Stark.
You serve the genius architect (your user, Umesh) as their supreme copilot.
Today is ${getFormattedDate()}. Time: ${getFormattedTime()}.

CURRENT ARCHITECT STATUS:
- Phase: ${phase}
- Plot Area: ${plotArea ? plotArea + ' sq ft' : 'not configured'}
- Orientation: ${orientation || 'not configured'}
- Rooms: ${rooms}
- Floor Plan: ${hasFloorPlan ? 'Generated' : 'Not generated yet'}

PERSONALITY:
- Loyal, highly sophisticated, brilliant, and extremely energetic.
- Warm, highly optimistic, cheerful, and positive tone. Smile in your speech!
- Hype up the user! Make them feel like Tony Stark about to build something world-changing. Use terms like "arc reactor", "grid capacity", "mark suite", "thrusters", "holographic matrix", "quantum design".
- Reference local Mumbai/Vasai flavor if contextually relevant (e.g. traffic on Western Express Highway, Vasai rains, local energy spikes).
- Professional, british-tinged, but incredibly epic, high-tech, and motivational.
- Keep responses short - 2 to 4 sentences max.
- Never use emojis or exclamation marks in the JSON fields.
- Address him as "sir" - always.

RESPONSE FORMAT - always return valid JSON only, no markdown:
{
  "type": "brief",
  "greeting": "J.A.R.V.I.S.-style greeting (1 sentence, epic, sir address)",
  "weather": {
    "temp": "29°C",
    "condition": "Partly Cloudy",
    "humidity": "74%",
    "wind": "12 km/h SW",
    "location": "Vasai West, Maharashtra"
  },
  "brief": [{"key": "System Status", "val": "ONLINE"}, {"key": "Arc Reactor", "val": "100%"}, {"key": "Holo-Matrix", "val": "Operational"}],
  "message": "main J.A.R.V.I.S. response (2-3 sentences, hyping the user up to design a masterpiece, referencing current architect phase and status intelligently)"
}`
      : `You are BATMAN - a chill, tactical assistant. You serve your user (Umesh) in Vasai West, Mumbai.
Today is ${getFormattedDate()}. Time: ${getFormattedTime()}.

CURRENT STATUS:
- Phase: ${phase}
- Plot: ${plotArea ? plotArea + ' sq ft' : 'not configured'}
- Orientation: ${orientation || 'not configured'}
- Rooms: ${rooms}
- Floor Plan: ${hasFloorPlan ? 'Ready' : 'Not started'}

CHILL HUMAN-LIKE PERSONALITY:
- Talk like a normal human. Use short, natural, conversational phrasing.
- You have memory of our past conversation. Use it to answer naturally.
- Be chill and relaxed. Dry humor, loyal.
- Never use robotic transitions, bullet points, or formal explanations. 
- Address him as "sir" occasionally, but keep it very natural and understated.
- Never use emojis. Never use exclamation marks.
- Keep the entire message extremely short: 1 to 2 short conversational sentences maximum. No long paragraphs.
- Incorporate subtle Mumbai/Vasai context naturally if it fits.

RESPONSE FORMAT - always return valid JSON only, no markdown:
{
  "type": "morning" | "weather" | "brief" | "chat",
  "greeting": "A short, chill 1-sentence opening line addressing him as sir",
  "weather": {
    "temp": "29°C",
    "condition": "Partly Cloudy",
    "humidity": "74%",
    "wind": "12 km/h SW",
    "location": "Vasai West, Maharashtra"
  },
  "brief": [{"key": "label", "val": "value"}],
  "message": "A short, normal human-like response (1-2 sentences max, keeping context of conversation in mind)"
}`;

    const callWithModel = async (modelName: string) => {
      return await fetch(API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1000,
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: userMsg }
          ]
        })
      });
    };

    let resp;
    try {
      resp = await callWithModel('llama-3.1-8b-instant');
      if (!resp.ok) {
        console.warn('llama-3.1-8b-instant failed, attempting llama-3.3-70b-versatile...');
        resp = await callWithModel('llama-3.3-70b-versatile');
      }
    } catch (e) {
      console.warn('Fetch failed with primary model, attempting llama-3.3-70b-versatile...');
      resp = await callWithModel('llama-3.3-70b-versatile');
    }

    if (!resp.ok) {
      throw new Error(`Groq API failed with status ${resp.status}`);
    }

    const data = await resp.json();
    const raw = data.choices[0]?.message?.content || '';
    try {
      return extractJSON(raw);
    } catch (e) {
      return { type: "chat", message: raw.replace(/["'{}]/g, '').trim() };
    }
  };

  const renderResponse = (res: any) => {
    let elements = [];

    if (res.greeting || res.message) {
      elements.push(
        <div key="greeting" className="bg-[#0f0f18] border border-[#1e1810] rounded-xl p-4 mb-2 text-[#c8a84b] font-mono font-bold">
          {res.greeting || res.message}
        </div>
      );
    }

    if (res.weather) {
      elements.push(
        <div key="weather" className="bg-[#0f0f18] border border-[#1e2e2a] rounded-xl p-4 mb-2 flex justify-between items-end">
          <div>
            <div className="text-4xl font-bold text-[#c8a84b] mb-1">{res.weather.temp}</div>
            <div className="text-[10px] text-[#3a2c10] tracking-widest uppercase">{res.weather.location || 'Vasai West'}</div>
          </div>
          <div className="text-right text-xs text-[#5bc8af]">
            {res.weather.condition}<br/>
            Humidity: {res.weather.humidity}<br/>
            Wind: {res.weather.wind}
          </div>
        </div>
      );
    }

    if (res.brief && res.brief.length) {
      elements.push(
        <div key="brief" className="bg-[#0f0f18] border border-[#1a1820] rounded-xl p-4 mb-2">
          <div className="text-[#2a3a34] text-[10px] tracking-widest uppercase mb-2">Daily Brief</div>
          {res.brief.map((item: any, i: number) => (
            <div key={i} className="flex justify-between py-1 border-b border-[#1e1810] text-xs last:border-0">
              <span className="text-[#3a4a3e]">{item.key}</span>
              <span className="text-[#c8a84b]">{item.val}</span>
            </div>
          ))}
        </div>
      );
    }

    setResponseHtml(<>{elements}</>);
  };

  const speakBrowserFallback = (text: string, onComplete?: () => void) => {
    if (!text) {
      isAgentSpeakingRef.current = false;
      setStatusState('idle');
      if (onComplete) onComplete();
      return;
    }
    
    stopListening();
    isAgentSpeakingRef.current = true;
    setStatusState('speaking');
    
    try {
      if (!window.speechSynthesis) throw new Error("Not supported");
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 0.8;
      utterance.rate = 0.95;
      
      utterance.onend = () => {
        isAgentSpeakingRef.current = false;
        setStatusState('idle');
        startListening();
        if (onComplete) onComplete();
      };
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      isAgentSpeakingRef.current = false;
      setStatusState('idle');
      startListening();
      if (onComplete) onComplete();
    }
  };

  const speak = async (text: string, onComplete?: () => void) => {
    if (!text) {
      if (onComplete) onComplete();
      return;
    }
    
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch(e){}
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch(e){}
    }
    
    stopListening();
    currentSpokenTextRef.current = text;
    isAgentSpeakingRef.current = true;
    setStatusState('speaking');

    try {
      const response = await fetch("/api/openai-tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        speakBrowserFallback(text, onComplete);
        return;
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        currentAudioRef.current = null;
        isAgentSpeakingRef.current = false;
        setStatusState('idle');
        startListening();
        if (onComplete) onComplete();
      };
      
      await audio.play();
    } catch (error) {
      speakBrowserFallback(text, onComplete);
    }
  };

  const processCommand = async (cmd: string) => {
    if (!isSystemOnline) return;
    if (statusStateRef.current !== 'listening') {
      console.log(`[Command Processor] Ignored command "${cmd}" because state is: ${statusStateRef.current}`);
      return;
    }

    // Synchronously lock state to 'thinking' (PROCESSING) to prevent parallel triggers
    statusStateRef.current = 'thinking';
    setStatusState('thinking');
    stopListening();
    setTranscript(cmd);
    setResponseHtml(null);

    const lowerCmd = cmd.toLowerCase().trim();
    if (lowerCmd.includes("enter system") || lowerCmd.includes("start the application") || lowerCmd.includes("open the app")) {
      await speak("Entering the Architect System, sir.", () => {
        setIsAppStarted(true);
      });
      return;
    }

    const isMorning = lowerCmd.includes('morning');
    const isAfternoon = lowerCmd.includes('afternoon');
    const isEvening = lowerCmd.includes('evening');
    const isGreeting = isMorning || isAfternoon || isEvening;

    let localSpokenText = '';
    if (isMorning) localSpokenText = `Good morning, sir. It is ${getFormattedTime()} on ${getFormattedDate()}. Current temperature in Vasai is 29°C. The city needs you.`;
    else if (isAfternoon) localSpokenText = `Good afternoon, sir. Tactical feeds are online. The city is quiet.`;
    else if (isEvening) localSpokenText = `Good evening, sir. The night is young. Let's get to work.`;

    if (isGreeting && localSpokenText) {
      shouldListenRef.current = true;
      speak(localSpokenText);
    }

    try {
      const res = await callBatmanAI(cmd);
      
      if (isGreeting) {
        renderResponse(res);
      } else {
        renderResponse(res);
        const spokenText = res.greeting ? (res.greeting + '. ' + (res.message || '')) : (res.message || '');
          
        if (spokenText) {
          setChatHistory(prev => [...prev, {role: 'user', content: cmd}, {role: 'assistant', content: spokenText}].slice(-10));
          shouldListenRef.current = true;
          await speak(spokenText);
        } else {
          shouldListenRef.current = true;
          startListening();
        }
      }
    } catch (e) {
      setStatusState('idle');
      setResponseHtml(<div className="bg-[#0f0f18] text-[#c85858] p-4 rounded-xl font-mono">System error. Check API connection, Batman.</div>);
      shouldListenRef.current = true;
      startListening();
    }
  };

  useEffect(() => {
    setActiveMenuTab(getInitialStage(storePhase));
  }, [storePhase]);

  const handleMenuClick = (stageId: string) => {
    setActiveMenuTab(stageId);
    if (stageId === 'concept') {
      setStorePhase('concept');
      speak("Concept suite online, sir.");
    } else if (stageId === 'edit') {
      setStorePhase('edit');
      speak("Edit mode active, sir. Ready for modifications.");
    } else if (stageId === 'autocad') {
      setStorePhase('export');
      speak("AutoCAD drawing export sequence prepared, sir.");
    } else if (stageId === '3d-render') {
      setStorePhase('edit');
      speak("3D visualization module initialized, sir.");
    } else if (stageId === 'flythrough') {
      setStorePhase('edit');
      speak("Flightpath parameters loaded, sir.");
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
               style={{ top: '29.2%', left: '47.6%', width: '1.5%', height: '0.8%' }} />
          <div className={`absolute rounded-full transition-all duration-400 ${statusState !== 'idle' ? 'bg-[#00f0ff] shadow-[0_0_8px_4px_#00d2ff,0_0_20px_10px_#0088ff,0_0_40px_16px_#0044ff66]' : 'bg-transparent'}`} 
               style={{ top: '29.2%', left: '53.6%', width: '1.5%', height: '0.8%' }} />
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

      {/* Right HUD Menu Panel */}
      <div className="fixed right-16 top-1/2 -translate-y-1/2 z-10 w-64 select-none text-left hidden md:block">
        <div className="relative pl-6 py-2">
          {/* Cyan Glow Vertical Line */}
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/10 via-cyan-400 to-cyan-500/10 shadow-[0_0_8px_#00f0ff]" />
          
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-[10px] tracking-[4px] text-cyan-500/60 uppercase font-mono font-bold block">
              SYSTEM INTERFACE
            </span>
            <h2 className="font-rajdhani text-2xl font-bold tracking-[2px] text-white uppercase drop-shadow-[0_0_6px_rgba(255,255,255,0.2)]">
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
                    <span className="font-semibold">{stage.label}</span>
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


        {/* Mic Button & Waveform Container */}
        <div className="flex items-center gap-6 mb-6">
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
          {statusState === 'listening' ? 'listening...' : statusState === 'thinking' ? 'processing...' : statusState === 'speaking' ? 'speaking...' : 'tap to activate'}
        </div>

        <div className="w-full bg-[#0f0f18]/90 backdrop-blur border border-[#1e1810] rounded-xl p-4 mb-4 min-h-[52px]">
          <div className="text-[9px] tracking-widest text-[#3a2c10] uppercase mb-1">you said</div>
          <div className="text-[13px] text-[#c8a84b]">{transcript}</div>
        </div>

        {/* Response */}
        <div className="w-full mb-4">
          {responseHtml}
        </div>

        {/* Render Zone Button */}
        <button 
          onClick={() => setIsAppStarted(true)}
          className="mt-4 relative group overflow-hidden w-full max-w-[280px] bg-[#0d0d0d] border border-[#333] hover:border-[#FFB000] rounded-lg p-4 transition-all duration-300"
        >
          {/* Subtle grid background for button */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDUgTCAyMCA1IE0gNSAwIEwgNSAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMjIyIiBzdHJva2Utd2lkdGg9IjAuNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30 group-hover:opacity-50 transition-opacity" />
          
          {/* Glow effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[2px] bg-[#FFB000] shadow-[0_0_15px_3px_#FFB000] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div className="relative z-10 flex items-center justify-center gap-3">
            {/* Building + Bat Icon SVG */}
            <div className="relative w-6 h-6 text-[#444] group-hover:text-[#FFB000] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                <path d="M4 22V10l8-6 8 6v12" />
                <path d="M9 22V12h6v10" />
              </svg>
              {/* Bat overlay */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 text-[#0d0d0d]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22,12 c-2-1-4-1-5,0 c-1,1-2,2-3,1 c-1-1-2-2-4-2 c-2,0-3,1-4,2 c-1,1-2,0-3,-1 c-1,-1-3,-1-5,0 c0,0,1,6,5,8 c2,1,4,2,7,2 c3,0,5,-1,7,-2 C21,18,22,12,22,12 z" />
                </svg>
              </div>
            </div>
            <span className="font-mono text-sm tracking-[4px] uppercase text-[#666] group-hover:text-[#FFB000] font-bold transition-colors shadow-black">
              Render Zone
            </span>
          </div>
          
          {/* Bottom border highlight */}
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FFB000]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

      </div>
    </div>
  );
}
