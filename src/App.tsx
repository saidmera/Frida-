import React, { useState, useEffect, useMemo } from "react";
import { 
  Heart, 
  X, 
  MessageCircle, 
  User, 
  Settings, 
  ShieldAlert, 
  Ban, 
  ChevronLeft, 
  ChevronRight,
  Send, 
  Smile, 
  Bell,
  MapPin,
  Mic,
  Square,
  Play,
  Pause,
  Image as ImageIcon 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import compatibilityTest from "./data/compatibility_test.json";

// --- Types ---

interface Profile {
  id: number;
  name: string;
  age: number;
  gender: string;
  body_type: string;
  personality: string[];
  lifestyle: string[];
  test_results?: Record<string, number>;
  image: string;
  latitude: number;
  longitude: number;
  city: string;
  last_interaction?: string;
  last_message?: string;
  last_message_time?: string;
}

interface Location {
  latitude: number;
  longitude: number;
}

interface Preferences {
  body_type: string;
  personality: string[];
  lifestyle: string;
  test_results?: Record<string, number>;
}

interface Message {
  id: number;
  profile_id: number;
  sender: 'user' | 'bot';
  content: string;
  type: 'text' | 'sticker' | 'emoji' | 'image' | 'audio';
  timestamp: string;
}

// --- Constants ---

const BOT_RESPONSES = [
  "Hey there! How's your day going?",
  "That's interesting! Tell me more.",
  "Haha, you're funny!",
  "I totally agree with that.",
  "What's your favorite thing to do on weekends?",
  "I'm a bit busy right now, but I'll text you later! 😊",
  "Wow, I've never thought about it that way.",
  "Do you like music? I've been listening to a lot of indie lately.",
  "Nice to meet you!",
  "✨",
  "👋",
  "Cool!",
];

const GREETING_REPLIES: Record<string, string> = {
  "salam": "Alaykom salam! How can I help you today?",
  "slm": "Alaykom salam! CV?",
  "hi": "Hello! How are you?",
  "hello": "Hi there! What's up?",
  "hey": "Hey! How's it going?",
  "slt": "Salut! Ça va?",
  "salut": "Salut! Comment ça va?",
  "cv": "Hamdullah, and you?",
  "how are you": "I'm doing great, thanks for asking!",
  "sup": "Not much, just chilling. You?",
};

const STICKERS = ["🐻", "🐱", "🐶", "🦊", "🦁", "🐸", "🦄"];

// Haversine formula to calculate distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function calculateCompatibility(profile: Profile, preferences: Preferences | null) {
  if (!preferences) return 0;
  let score = 0;
  let totalPossible = 0;

  // Body type (weight: 5)
  if (profile.body_type === preferences.body_type) score += 5;
  totalPossible += 5;

  // Personality (weight: 2 per match)
  preferences.personality.forEach(p => {
    if (profile.personality.includes(p)) score += 2;
    totalPossible += 2;
  });

  // Lifestyle (weight: 3)
  if (profile.lifestyle.includes(preferences.lifestyle)) score += 3;
  totalPossible += 3;

  // Test Results (weight: 10)
  if (profile.test_results && preferences.test_results) {
    Object.keys(preferences.test_results).forEach(area => {
      const userScore = preferences.test_results?.[area] || 0;
      const profileScore = profile.test_results?.[area] || 0;
      // Closer scores mean higher compatibility in that area
      const diff = Math.abs(userScore - profileScore);
      const areaMaxScore = 5; // Assuming max weight per area is roughly 5
      score += Math.max(0, areaMaxScore - diff);
      totalPossible += areaMaxScore;
    });
  }

  return Math.round((score / totalPossible) * 100);
}

// Synthesized Bell Sound (Offline)
const playBell = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioContext = new AudioContextClass();
    const playTone = (freq: number, start: number, duration: number, volume: number) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    
    const now = audioContext.currentTime;
    // Layered frequencies for a "ding" bell sound
    playTone(880, now, 1.0, 0.1);
    playTone(1760, now, 0.5, 0.05);
    playTone(1320, now, 0.7, 0.03);
  } catch (e) {
    console.warn("Audio playback blocked or failed", e);
  }
};

// --- Components ---

const APP_ICON = "https://storage.googleapis.com/generativeai-downloads/images/frida_logo.png"; // Placeholder for the user's uploaded image

const ShoeLogo = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://storage.googleapis.com/generativeai-downloads/images/frida_logo.png" 
    alt="Frida Logo" 
    style={{ width: size, height: size }}
    className={`rounded-full object-cover ${className}`}
    referrerPolicy="no-referrer"
  />
);

export default function App() {
  const [view, setView] = useState<'survey' | 'feed' | 'matches' | 'chat' | 'profile' | 'notifications'>('feed');
  const [history, setHistory] = useState<string[]>(['feed']);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [activeChatProfile, setActiveChatProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [notifications, setNotifications] = useState<Profile[]>([]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
        if (event.state.profile) setActiveChatProfile(event.state.profile);
      } else {
        setView('feed');
      }
    };

    window.addEventListener('popstate', handlePopState);
    // Initial state
    window.history.replaceState({ view: 'feed' }, '');

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newView: typeof view, profile?: Profile) => {
    setView(newView);
    if (profile) setActiveChatProfile(profile);
    window.history.pushState({ view: newView, profile }, '', `#${newView}`);
  };

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        // Get user location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setUserLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              });
            },
            (err) => console.error("Geolocation error", err)
          );
        }

        const [pRes, prefRes] = await Promise.all([
          fetch("/api/profiles"),
          fetch("/api/preferences")
        ]);
        const pData = await pRes.json();
        const prefData = await prefRes.json();
        
        setProfiles(pData);
        setPreferences(prefData);
        
        // Simulate notifications from Liza and Khadija
        const liza = pData.find((p: Profile) => p.name === "Liza");
        const khadija = pData.find((p: Profile) => p.name === "Khadija");
        if (liza || khadija) {
          setNotifications([liza, khadija].filter(Boolean));
          // Small delay to ensure user has interacted (browsers block auto-audio)
          setTimeout(playBell, 1000);
        }

        if (!prefData) navigateTo('survey');
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Compatibility & Distance Scoring
  const sortedProfiles = useMemo(() => {
    let result = [...profiles];
    
    result.sort((a, b) => {
      // Primary sort: Compatibility
      const compA = calculateCompatibility(a, preferences);
      const compB = calculateCompatibility(b, preferences);
      
      if (compA !== compB) return compB - compA;

      // Secondary sort: Distance
      if (userLocation) {
        const distA = calculateDistance(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude);
        const distB = calculateDistance(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude);
        return distA - distB;
      }
      return 0;
    });
    
    return result.filter(p => !p.last_interaction || p.last_interaction === 'like');
  }, [profiles, preferences, userLocation]);

  // Filter out profiles already liked/skipped for the feed
  const feedProfiles = useMemo(() => {
    return sortedProfiles.filter(p => !p.last_interaction);
  }, [sortedProfiles]);

  const handleInteraction = async (profileId: number, type: 'like' | 'skip' | 'block' | 'report') => {
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, type })
      });
      const data = await res.json();
      
      if (data.matched && type === 'like') {
        alert(`It's a match with ${profiles.find(p => p.id === profileId)?.name}!`);
        playBell();
      }

      // Update local state
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, last_interaction: type } : p));
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error(err);
    }
  };

  const startChat = async (profile: Profile) => {
    setActiveChatProfile(profile);
    navigateTo('chat', profile);
    const res = await fetch(`/api/messages/${profile.id}`);
    const data = await res.json();
    setMessages(data);
  };

  const sendMessage = async (content: string, type: 'text' | 'sticker' | 'emoji' | 'image' | 'audio' = 'text') => {
    if (!activeChatProfile) return;
    
    const userMsg = { profile_id: activeChatProfile.id, sender: 'user' as const, content, type };
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userMsg)
    });

    // Update local profiles state for last message
    setProfiles(prev => prev.map(p => p.id === activeChatProfile.id ? { 
      ...p, 
      last_message: type === 'text' ? content : `Sent a ${type}`,
      last_message_time: new Date().toISOString()
    } : p));

    // Refresh messages
    const res = await fetch(`/api/messages/${activeChatProfile.id}`);
    setMessages(await res.json());

    // Bot response simulation
    setTimeout(async () => {
      let botResponse = BOT_RESPONSES[Math.floor(Math.random() * BOT_RESPONSES.length)];
      
      // Check for greetings
      const lowerContent = content.toLowerCase().trim();
      for (const [key, reply] of Object.entries(GREETING_REPLIES)) {
        if (lowerContent.includes(key)) {
          botResponse = reply;
          break;
        }
      }

      const botMsg = { 
        profile_id: activeChatProfile.id, 
        sender: 'bot' as const, 
        content: botResponse,
        type: 'text' as const
      };
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(botMsg)
      });

      // Update local profiles state for bot's last message
      setProfiles(prev => prev.map(p => p.id === activeChatProfile.id ? { 
        ...p, 
        last_message: botResponse,
        last_message_time: new Date().toISOString()
      } : p));

      const res2 = await fetch(`/api/messages/${activeChatProfile.id}`);
      setMessages(await res2.json());
      playBell();
    }, 1500);
  };

  if (loading) return <div className="flex flex-col items-center justify-center h-screen bg-[#f5f2ed] font-serif gap-4">
    <ShoeLogo size={64} className="text-[#5A5A40] animate-bounce" />
    <p className="text-[#5A5A40] italic">Finding your Frida...</p>
  </div>;

  return (
    <div className="max-w-md mx-auto h-screen bg-[#f5f2ed] flex flex-col shadow-2xl overflow-hidden font-sans text-[#1a1a1a]">
      
      {/* Header */}
      {view !== 'survey' && (
        <header className="p-4 border-b border-black/5 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <ShoeLogo size={28} className="text-[#5A5A40]" />
            <h1 className="text-2xl font-serif italic font-bold text-[#5A5A40]">Frida</h1>
          </div>
          <div className="flex gap-4">
            <button onClick={() => navigateTo('notifications')} className={`relative ${view === 'notifications' ? 'text-[#5A5A40]' : 'text-gray-400'}`}>
              <Bell size={24} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                  {notifications.length}
                </span>
              )}
            </button>
            <button onClick={() => navigateTo('feed')} className={view === 'feed' ? 'text-[#5A5A40]' : 'text-gray-400'}><Heart size={24} /></button>
            <button onClick={() => navigateTo('matches')} className={view === 'matches' ? 'text-[#5A5A40]' : 'text-gray-400'}><MessageCircle size={24} /></button>
            <button onClick={() => navigateTo('profile')} className={view === 'profile' ? 'text-[#5A5A40]' : 'text-gray-400'}><User size={24} /></button>
          </div>
        </header>
      )}

      <main className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {view === 'survey' && (
            <SurveyView onComplete={(prefs) => { setPreferences(prefs); navigateTo('feed'); }} />
          )}

          {view === 'notifications' && (
            <motion.div 
              key="notifications"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4"
            >
              <h2 className="text-lg font-serif italic mb-4">Notifications</h2>
              <div className="space-y-3">
                {notifications.map(profile => (
                  <div 
                    key={profile.id}
                    className="flex flex-col gap-3 p-4 bg-white rounded-2xl shadow-sm border-l-4 border-[#5A5A40]"
                  >
                    <div className="flex items-center gap-4">
                      <img src={profile.image} alt={profile.name} className="w-12 h-12 rounded-full object-cover" />
                      <div className="flex-1">
                        <p className="text-sm font-medium"><span className="font-bold">{profile.name}</span> liked your profile!</p>
                        <p className="text-[10px] text-gray-400">Would you like to match with them?</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setNotifications(prev => prev.filter(n => n.id !== profile.id));
                          setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, last_interaction: 'like' } : p));
                          startChat(profile);
                        }}
                        className="flex-1 py-2 bg-[#5A5A40] text-white text-xs font-bold rounded-lg"
                      >
                        Accept
                      </button>
                      <button 
                        onClick={() => {
                          setNotifications(prev => prev.filter(n => n.id !== profile.id));
                          navigateTo('feed');
                        }}
                        className="flex-1 py-2 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="text-center text-gray-400 py-10 text-sm">No new notifications.</p>
                )}
              </div>
            </motion.div>
          )}

          {view === 'feed' && (
            <motion.div 
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full p-4 flex flex-col"
            >
              {currentIndex < feedProfiles.length ? (
                <div className="relative flex-1">
                  <ProfileCard 
                    profile={feedProfiles[currentIndex]} 
                    preferences={preferences}
                    userLocation={userLocation}
                    onLike={() => handleInteraction(feedProfiles[currentIndex].id, 'like')}
                    onSkip={() => handleInteraction(feedProfiles[currentIndex].id, 'skip')}
                    onBlock={() => handleInteraction(feedProfiles[currentIndex].id, 'block')}
                    onReport={() => handleInteraction(feedProfiles[currentIndex].id, 'report')}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                    <Heart className="text-gray-400" size={40} />
                  </div>
                  <h2 className="text-xl font-serif italic mb-2">No more profiles nearby</h2>
                  <p className="text-sm text-gray-500">Try changing your preferences or check back later!</p>
                  <button 
                    onClick={() => setView('profile')}
                    className="mt-6 px-6 py-2 bg-[#5A5A40] text-white rounded-full text-sm font-medium"
                  >
                    Edit Preferences
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'matches' && (
            <motion.div 
              key="matches"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="p-4"
            >
              <h2 className="text-lg font-serif italic mb-4">Messages</h2>
              <div className="grid grid-cols-1 gap-4">
                {profiles
                  .filter(p => p.last_message)
                  .sort((a, b) => new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime())
                  .map(profile => {
                    const distance = userLocation 
                      ? calculateDistance(userLocation.latitude, userLocation.longitude, profile.latitude, profile.longitude)
                      : null;
                    
                    return (
                      <div 
                        key={profile.id}
                        onClick={() => startChat(profile)}
                        className="flex items-center gap-4 p-3 bg-white rounded-2xl shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <img src={profile.image} alt={profile.name} className="w-14 h-14 rounded-full object-cover border-2 border-[#5A5A40]/20" />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <h3 className="font-medium truncate">{profile.name}</h3>
                            <span className="text-[10px] text-gray-400">
                              {profile.last_message_time && new Date(profile.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500 truncate flex-1">
                              {profile.last_message}
                            </p>
                            {distance !== null && (
                              <span className="text-[9px] text-gray-400 whitespace-nowrap">
                                {Math.round(distance)}km
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                      </div>
                    );
                  })}
                {profiles.filter(p => p.last_message).length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-gray-400 text-sm mb-4">No conversations yet.</p>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-4">New Matches</h3>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {profiles.filter(p => p.last_interaction === 'like' && !p.last_message).map(p => (
                        <div key={p.id} onClick={() => startChat(p)} className="flex-shrink-0 text-center cursor-pointer">
                          <img src={p.image} className="w-16 h-16 rounded-full object-cover border-2 border-[#5A5A40]/20 mb-1" />
                          <p className="text-[10px] font-medium">{p.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {profiles.filter(p => p.last_message).length > 0 && profiles.filter(p => p.last_interaction === 'like' && !p.last_message).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">New Matches</h3>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {profiles.filter(p => p.last_interaction === 'like' && !p.last_message).map(p => (
                        <div key={p.id} onClick={() => startChat(p)} className="flex-shrink-0 text-center cursor-pointer">
                          <img src={p.image} className="w-16 h-16 rounded-full object-cover border-2 border-[#5A5A40]/20 mb-1" />
                          <p className="text-[10px] font-medium">{p.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'chat' && activeChatProfile && (
            <ChatView 
              profile={activeChatProfile} 
              messages={messages} 
              onBack={() => window.history.back()} 
              onSend={sendMessage}
            />
          )}

          {view === 'profile' && (
            <ProfileSettings 
              preferences={preferences} 
              userLocation={userLocation}
              onRefreshLocation={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setUserLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                      });
                    },
                    (err) => console.error("Geolocation error", err)
                  );
                }
              }}
              onUpdate={(p) => { setPreferences(p); navigateTo('feed'); setCurrentIndex(0); }}
              onRetakeTest={() => navigateTo('survey')}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function SurveyView({ onComplete }: { onComplete: (prefs: Preferences) => void }) {
  const [step, setStep] = useState(-1); // -1 for language selection
  const [lang, setLang] = useState<'en' | 'fr' | 'ar'>('en');
  const [prefs, setPrefs] = useState<Preferences>({
    body_type: 'average',
    personality: [],
    lifestyle: 'socially_active',
    test_results: {}
  });

  const bodyTypes = ['slim', 'athletic', 'average', 'muscular', 'curvy'];
  const personalities = ['adventurous', 'friendly', 'playful', 'confident', 'ambitious', 'independent', 'introvert', 'creative', 'empathetic', 'leader', 'disciplined', 'charismatic', 'spiritual', 'humorous', 'kind', 'reliable', 'energetic', 'optimistic', 'bold', 'intellectual', 'calm', 'witty', 'compassionate', 'curious', 'gentle'];
  const lifestyles = ['traveler', 'socially_active', 'fitness_oriented', 'tech_savvy', 'homebody', 'artistic', 'entrepreneurial', 'luxury_lifestyle', 'academic', 'gamer', 'foodie', 'athlete', 'nature_lover', 'reader', 'coffee_enthusiast', 'volunteer', 'musician'];

  const handleFinish = async () => {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs)
    });
    onComplete(prefs);
  };

  const currentQuestion = step >= 3 ? compatibilityTest[step - 3] : null;

  return (
    <div className={`p-8 flex flex-col h-full justify-center bg-white ${lang === 'ar' ? 'text-right' : 'text-left'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <motion.div
        key={step}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="space-y-8"
      >
        {step === -1 && (
          <div className="space-y-6 text-center">
            <ShoeLogo size={80} className="mx-auto mb-4" />
            <h2 className="text-2xl font-serif italic text-[#5A5A40]">Choose your language / Choisissez votre langue / اختر لغتك</h2>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => { setLang('en'); setStep(0); }} className="py-3 bg-gray-100 rounded-xl font-medium hover:bg-[#5A5A40] hover:text-white transition-all">English</button>
              <button onClick={() => { setLang('fr'); setStep(0); }} className="py-3 bg-gray-100 rounded-xl font-medium hover:bg-[#5A5A40] hover:text-white transition-all">Français</button>
              <button onClick={() => { setLang('ar'); setStep(0); }} className="py-3 bg-gray-100 rounded-xl font-medium hover:bg-[#5A5A40] hover:text-white transition-all">العربية</button>
            </div>
          </div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <ShoeLogo size={60} className="mx-auto mb-2" />
              <h2 className="text-2xl font-serif italic text-[#5A5A40]">
                {lang === 'en' ? 'Welcome to Frida' : lang === 'fr' ? 'Bienvenue sur Frida' : 'مرحباً بك في فريدة'}
              </h2>
            </div>
            <label className="block text-sm font-medium text-gray-700">
              {lang === 'en' ? 'Preferred Body Type' : lang === 'fr' ? 'Type de corps préféré' : 'نوع الجسم المفضل'}
            </label>
            <div className="flex flex-wrap gap-2">
              {bodyTypes.map(bt => (
                <button
                  key={bt}
                  onClick={() => setPrefs({ ...prefs, body_type: bt })}
                  className={`px-4 py-2 rounded-full text-sm capitalize transition-all ${prefs.body_type === bt ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {bt}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium mt-4">
              {lang === 'en' ? 'Next' : lang === 'fr' ? 'Suivant' : 'التالي'}
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {lang === 'en' ? 'Top Personality Traits (Select 3)' : lang === 'fr' ? 'Traits de personnalité (Sélectionnez 3)' : 'أهم سمات الشخصية (اختر 3)'}
            </label>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
              {personalities.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    const newP = prefs.personality.includes(p) 
                      ? prefs.personality.filter(x => x !== p)
                      : [...prefs.personality, p].slice(-3);
                    setPrefs({ ...prefs, personality: newP });
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs capitalize transition-all ${prefs.personality.includes(p) ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium mt-4">
              {lang === 'en' ? 'Next' : lang === 'fr' ? 'Suivant' : 'التالي'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {lang === 'en' ? 'Preferred Lifestyle' : lang === 'fr' ? 'Mode de vie préféré' : 'أسلوب الحياة المفضل'}
            </label>
            <div className="flex flex-wrap gap-2">
              {lifestyles.map(l => (
                <button
                  key={l}
                  onClick={() => setPrefs({ ...prefs, lifestyle: l })}
                  className={`px-4 py-2 rounded-full text-sm capitalize transition-all ${prefs.lifestyle === l ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {l.replace('_', ' ')}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(3)} className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium mt-4">
              {lang === 'en' ? 'Start Compatibility Test' : lang === 'fr' ? 'Démarrer le test de compatibilité' : 'ابدأ اختبار التوافق'}
            </button>
          </div>
        )}

        {currentQuestion && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40]">
                {lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'سؤال'} {step - 2} / {compatibilityTest.length}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {currentQuestion.area.replace('_', ' ')}
              </span>
            </div>
            <h3 className="text-xl font-serif italic text-gray-800 leading-tight">
              {currentQuestion.question[lang]}
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {currentQuestion.options.map(opt => (
                <button
                  key={opt.option_id}
                  onClick={() => {
                    const newResults = { ...prefs.test_results, [currentQuestion.area]: (prefs.test_results?.[currentQuestion.area] || 0) + opt.weight };
                    setPrefs({ ...prefs, test_results: newResults });
                    if (step - 3 < compatibilityTest.length - 1) {
                      setStep(step + 1);
                    } else {
                      handleFinish();
                    }
                  }}
                  className="p-4 text-sm bg-gray-50 rounded-2xl border border-black/5 hover:border-[#5A5A40] hover:bg-[#5A5A40]/5 transition-all text-left flex items-center gap-3"
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                >
                  <div className="w-6 h-6 rounded-full bg-white border border-black/10 flex items-center justify-center text-[10px] font-bold text-gray-400">
                    {opt.option_id}
                  </div>
                  <span className="flex-1">{opt.text[lang]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ProfileCard({ profile, preferences, userLocation, onLike, onSkip, onBlock, onReport }: { 
  profile: Profile, 
  preferences: Preferences | null,
  userLocation: Location | null,
  onLike: () => void, 
  onSkip: () => void,
  onBlock: () => void,
  onReport: () => void
}) {
  const [showOptions, setShowOptions] = useState(false);

  const distance = userLocation 
    ? calculateDistance(userLocation.latitude, userLocation.longitude, profile.latitude, profile.longitude)
    : null;

  const compatibility = calculateCompatibility(profile, preferences);

  return (
    <motion.div 
      layout
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="h-full flex flex-col bg-white rounded-[32px] shadow-xl overflow-hidden border border-black/5"
    >
      <div className="relative flex-1">
        <img src={profile.image} alt={profile.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        
        <div className="absolute top-6 left-6">
          <div className="bg-[#5A5A40] text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1">
            <Heart size={10} fill="currentColor" /> {compatibility}% Match
          </div>
        </div>

        <div className="absolute bottom-0 left-0 p-6 text-white w-full">
          <div className="flex justify-between items-end">
            <div>
              <h3 className="text-3xl font-serif italic font-bold">{profile.name}, {profile.age}</h3>
              <div className="flex items-center gap-2 text-sm opacity-80 capitalize">
                <div className="flex items-center gap-1">
                  <MapPin size={14} /> {profile.city}
                </div>
                {distance !== null && (
                  <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {distance < 1 ? '< 1km' : `${Math.round(distance)}km away`}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-60 capitalize mt-1">{profile.body_type} • {profile.gender}</p>
            </div>
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="p-2 bg-white/20 backdrop-blur-md rounded-full"
            >
              <Settings size={20} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {profile.personality.map(p => (
              <span key={p} className="px-2 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] uppercase tracking-wider font-semibold">{p}</span>
            ))}
          </div>
        </div>

        {showOptions && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 right-4 bg-white rounded-2xl shadow-2xl p-2 z-20 flex flex-col gap-1"
          >
            <button onClick={onBlock} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl">
              <Ban size={16} /> Block
            </button>
            <button onClick={onReport} className="flex items-center gap-2 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-xl">
              <ShieldAlert size={16} /> Report
            </button>
          </motion.div>
        )}
      </div>

      <div className="p-6 flex justify-center gap-8 bg-white">
        <button 
          onClick={onSkip}
          className="w-16 h-16 flex items-center justify-center rounded-full border-2 border-gray-100 text-gray-400 hover:bg-gray-50 transition-all active:scale-90"
        >
          <X size={32} />
        </button>
        <button 
          onClick={onLike}
          className="w-16 h-16 flex items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-lg shadow-[#5A5A40]/30 hover:bg-[#4a4a35] transition-all active:scale-90"
        >
          <Heart size={32} fill="currentColor" />
        </button>
      </div>
    </motion.div>
  );
}

function ChatView({ profile, messages, onBack, onSend }: { 
  profile: Profile, 
  messages: Message[], 
  onBack: () => void,
  onSend: (content: string, type?: 'text' | 'sticker' | 'emoji' | 'image' | 'audio') => void
}) {
  const [input, setInput] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          onSend(reader.result as string, 'audio');
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone", err);
      alert("Please allow microphone access to record voice messages.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onSend(reader.result as string, 'image');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b flex items-center gap-3">
        <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={24} /></button>
        <img src={profile.image} alt={profile.name} className="w-10 h-10 rounded-full object-cover" />
        <div>
          <h3 className="font-medium text-sm">{profile.name}</h3>
          <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Online</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
              msg.sender === 'user' 
                ? 'bg-[#5A5A40] text-white rounded-tr-none' 
                : 'bg-gray-100 text-gray-800 rounded-tl-none'
            }`}>
              {msg.type === 'sticker' ? (
                <span className="text-4xl">{msg.content}</span>
              ) : msg.type === 'image' ? (
                <img src={msg.content} alt="Sent image" className="rounded-lg max-w-full" />
              ) : msg.type === 'audio' ? (
                <VoiceMessage src={msg.content} isUser={msg.sender === 'user'} />
              ) : (
                msg.content
              )}
              <div className={`text-[9px] mt-1 opacity-50 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t space-y-2">
        {showStickers && (
          <div className="flex gap-4 p-2 bg-gray-50 rounded-xl overflow-x-auto">
            {STICKERS.map(s => (
              <button key={s} onClick={() => { onSend(s, 'sticker'); setShowStickers(false); }} className="text-3xl hover:scale-110 transition-transform">{s}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 bg-red-50 rounded-full px-4 py-2 text-red-600">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
              <span className="text-sm font-medium flex-1">Recording... {formatTime(recordingTime)}</span>
              <button onClick={stopRecording} className="p-1 bg-red-600 text-white rounded-full">
                <Square size={16} fill="currentColor" />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowStickers(!showStickers)} className="p-2 text-gray-400 hover:text-[#5A5A40]"><Smile size={20} /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-[#5A5A40]"><ImageIcon size={20} /></button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) { onSend(input); setInput(""); } }}
                placeholder="Type a message..."
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
              />
              {input.trim() ? (
                <button 
                  onClick={() => { if (input.trim()) { onSend(input); setInput(""); } }}
                  className="p-2 bg-[#5A5A40] text-white rounded-full"
                >
                  <Send size={18} />
                </button>
              ) : (
                <button 
                  onClick={startRecording}
                  className="p-2 text-gray-400 hover:text-[#5A5A40]"
                >
                  <Mic size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceMessage({ src, isUser }: { src: string, isUser: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-3 min-w-[150px]">
      <button 
        onClick={togglePlay}
        className={`w-8 h-8 flex items-center justify-center rounded-full ${
          isUser ? 'bg-white/20 text-white' : 'bg-[#5A5A40] text-white'
        }`}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 h-1 bg-current opacity-20 rounded-full relative">
        <div className="absolute inset-0 bg-current rounded-full" style={{ width: '0%' }} />
      </div>
      <audio 
        ref={audioRef} 
        src={src} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden" 
      />
    </div>
  );
}

function ProfileSettings({ preferences, userLocation, onUpdate, onRefreshLocation, onRetakeTest }: { 
  preferences: Preferences | null, 
  userLocation: Location | null,
  onUpdate: (p: Preferences) => void,
  onRefreshLocation: () => void,
  onRetakeTest: () => void
}) {
  const [localPrefs, setLocalPrefs] = useState<Preferences>(preferences || {
    body_type: 'average',
    personality: [],
    lifestyle: 'socially_active',
    test_results: {}
  });

  const bodyTypes = ['slim', 'athletic', 'average', 'muscular', 'curvy'];
  const lifestyles = ['traveler', 'socially_active', 'fitness_oriented', 'tech_savvy', 'homebody', 'artistic', 'entrepreneurial', 'luxury_lifestyle', 'academic', 'gamer', 'foodie', 'athlete', 'nature_lover', 'reader', 'coffee_enthusiast', 'volunteer', 'musician'];

  const handleSave = async () => {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localPrefs)
    });
    onUpdate(localPrefs);
  };

  return (
    <div className="p-6 space-y-8 bg-white h-full">
      <div className="flex items-center gap-2">
        <ShoeLogo size={24} className="text-[#5A5A40]" />
        <h2 className="text-2xl font-serif italic text-[#5A5A40]">Frida Settings</h2>
      </div>
      
      <div className="space-y-6">
        <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-black/5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Location Status</label>
            <button 
              onClick={onRefreshLocation}
              className="text-[10px] font-bold text-[#5A5A40] hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${userLocation ? 'bg-green-500' : 'bg-red-500'}`} />
            <p className="text-sm font-medium">
              {userLocation 
                ? `Active (${userLocation.latitude.toFixed(2)}, ${userLocation.longitude.toFixed(2)})` 
                : 'Location Access Denied'}
            </p>
          </div>
          <p className="text-[10px] text-gray-400 leading-tight">
            SoulMatch uses your real GPS coordinates to find people nearby.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Body Type</label>
          <div className="flex flex-wrap gap-2">
            {bodyTypes.map(bt => (
              <button
                key={bt}
                onClick={() => setLocalPrefs({ ...localPrefs, body_type: bt })}
                className={`px-3 py-1.5 rounded-full text-xs capitalize transition-all ${localPrefs.body_type === bt ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {bt}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Lifestyle</label>
          <div className="flex flex-wrap gap-2">
            {lifestyles.map(l => (
              <button
                key={l}
                onClick={() => setLocalPrefs({ ...localPrefs, lifestyle: l })}
                className={`px-3 py-1.5 rounded-full text-xs capitalize transition-all ${localPrefs.lifestyle === l ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {l.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-4 bg-[#5A5A40]/5 rounded-2xl border border-[#5A5A40]/10">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-widest text-[#5A5A40]">Compatibility Test</label>
            <button 
              onClick={onRetakeTest}
              className="text-[10px] font-bold text-[#5A5A40] hover:underline"
            >
              Retake Test
            </button>
          </div>
          {localPrefs.test_results && Object.keys(localPrefs.test_results).length > 0 ? (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {Object.entries(localPrefs.test_results).map(([area, score]) => (
                <div key={area} className="flex flex-col">
                  <span className="text-[10px] text-gray-400 capitalize">{area.replace('_', ' ')}</span>
                  <div className="w-full h-1 bg-gray-200 rounded-full mt-1">
                    <div className="h-full bg-[#5A5A40] rounded-full" style={{ width: `${((score as number) / 15) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No test results yet.</p>
          )}
        </div>

        <div className="pt-8 border-t">
          <button 
            onClick={handleSave}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-lg shadow-[#5A5A40]/20"
          >
            Save Changes
          </button>
          
          <div className="mt-8 p-4 bg-red-50 rounded-2xl border border-red-100">
            <h4 className="text-sm font-bold text-red-800 mb-1">Privacy Notice</h4>
            <p className="text-xs text-red-600 opacity-80">This app is an offline simulator. All data is stored locally on this device and is never sent to any server.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
