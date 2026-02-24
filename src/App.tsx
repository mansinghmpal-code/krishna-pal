/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Activity, ClipboardList, AlertCircle, ChevronRight, Loader2, Plus, Trash2, X, Moon, Sun, Clock } from 'lucide-react';
import Markdown from 'react-markdown';
import { analyzeDiscipline } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sound Synthesis Utility
const playSound = (type: 'success' | 'milestone' | 'failure') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'milestone') {
      // Deep cinematic boom
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + 3);
      osc.start(now);
      osc.stop(now + 3);
      
      // High shimmer
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(440, now);
      gain2.gain.setValueAtTime(0.05, now);
      gain2.gain.linearRampToValueAtTime(0, now + 4);
      osc2.start(now);
      osc2.stop(now + 4);
    } else if (type === 'failure') {
      // Low ominous drone
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(40, now);
      osc.frequency.linearRampToValueAtTime(20, now + 1.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 2);
      osc.start(now);
      osc.stop(now + 2);
    }
  } catch (e) {
    console.error('Audio context failed', e);
  }
};

export default function App() {
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [timestamp, setTimestamp] = useState<string>('');
  const [view, setView] = useState<'home' | 'tasks' | 'stats' | 'ai'>('home');
  const [activeAnimation, setActiveAnimation] = useState<'fire' | 'struggle' | 'milestone-10' | 'milestone-elite' | 'first-task' | 'streak-start' | null>(null);
  const [isMajorLoss, setIsMajorLoss] = useState(false);
  const [isEliteLoss, setIsEliteLoss] = useState(false);
  const [showReinforcement, setShowReinforcement] = useState(false);
  const [animatingTaskId, setAnimatingTaskId] = useState<number | null>(null);
  const [notifiedTasks, setNotifiedTasks] = useState<Record<string, { reminded: boolean, expired: boolean }>>(() => {
    const saved = localStorage.getItem('notifiedTasks');
    return saved ? JSON.parse(saved) : {};
  });
  const [aiConfig, setAiConfig] = useState<{ provider: 'gemini' | 'gpt' | null, isConnected: boolean, apiKey?: string }>({
    provider: null,
    isConnected: false
  });

  // Sleep State
  const [isSleeping, setIsSleeping] = useState(() => {
    return localStorage.getItem('isSleeping') === 'true';
  });
  const [sleepStartTime, setSleepStartTime] = useState(() => {
    return localStorage.getItem('sleepStartTime') || null;
  });
  const [sleepDuration, setSleepDuration] = useState('00:00:00');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [wakeMessage, setWakeMessage] = useState<string | null>(null);
  const [sleepLogs, setSleepLogs] = useState<{ date: string, start: string, end: string, duration: string }[]>(() => {
    const saved = localStorage.getItem('sleepLogs');
    return saved ? JSON.parse(saved) : [];
  });

  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('disciplineStats');
    if (saved) return JSON.parse(saved);
    return {
      score: 0,
      consistency: 0,
      streakHistory: [0, 0, 0, 0, 0, 0, 0],
      failureHistory: [] as { day: string, date: string }[],
      tasks: [
        { id: 1, title: 'Wake up at 05:00', status: 'pending', time: '05:00', priority: 3, streak: 0 },
        { id: 2, title: 'Deep Work Session (2h)', status: 'pending', time: '08:00', priority: 3, streak: 0 },
        { id: 3, title: 'Gym: Strength Training', status: 'pending', time: '16:00', priority: 2, streak: 0 },
        { id: 4, title: 'Read 20 Pages', status: 'pending', time: '20:00', priority: 1, streak: 0 },
        { id: 5, title: 'No Screen 1h Before Bed', status: 'pending', time: '21:00', priority: 2, streak: 0 },
      ]
    };
  });

  const derivedStats = useMemo(() => {
    const peakStreak = Math.max(...stats.tasks.map(t => t.streak), 0);
    const strongestHabit = stats.tasks.reduce((prev, current) => (prev.streak > current.streak) ? prev : current, stats.tasks[0])?.title || 'None';
    
    const totalDurationMinutes = sleepLogs.reduce((acc, log) => {
      const parts = log.duration.split(' ');
      let h = 0, m = 0;
      parts.forEach(p => {
        if (p.includes('h')) h = parseInt(p);
        if (p.includes('m')) m = parseInt(p);
      });
      return acc + (h * 60) + m;
    }, 0);
    const avgSleepMinutes = sleepLogs.length > 0 ? totalDurationMinutes / sleepLogs.length : 0;
    const avgSleepStr = `${Math.floor(avgSleepMinutes / 60)}h ${Math.round(avgSleepMinutes % 60)}m`;

    const completed = stats.tasks.filter(t => t.status === 'completed').length;
    const missed = stats.tasks.filter(t => t.status === 'missed').length;
    const total = completed + missed;
    const sessionConsistency = total > 0 ? Math.round((completed / total) * 100) : 0;

    const dayCounts: Record<string, number> = {};
    (stats.failureHistory || []).forEach(f => {
      dayCounts[f.day] = (dayCounts[f.day] || 0) + 1;
    });
    const weakestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

    return {
      peakStreak,
      strongestHabit,
      avgSleep: avgSleepStr,
      consistency: sessionConsistency || stats.consistency,
      weakestDay
    };
  }, [stats.tasks, sleepLogs, stats.failureHistory, stats.consistency]);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', time: '08:00', priority: 2, isAnyTime: false });

  const calculateScore = React.useCallback((currentTasks: any[]) => {
    const completed = currentTasks.filter(t => t.status === 'completed').length;
    const total = currentTasks.length || 1;
    const baseConsistency = (completed / total) * 100;
    const avgStreak = currentTasks.reduce((acc, t) => acc + t.streak, 0) / total;
    const streakWeight = Math.log2(avgStreak + 1) / Math.log2(100);
    return Math.round((baseConsistency * 5) + (streakWeight * 300));
  }, []);

  useEffect(() => {
    localStorage.setItem('disciplineStats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('notifiedTasks', JSON.stringify(notifiedTasks));
  }, [notifiedTasks]);

  // Daily Reset Logic
  useEffect(() => {
    const lastReset = localStorage.getItem('lastResetDate');
    const today = new Date().toDateString();
    
    if (lastReset !== today) {
      setStats(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => ({ ...t, status: 'pending' }))
      }));
      setNotifiedTasks({});
      localStorage.setItem('lastResetDate', today);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sleepLogs', JSON.stringify(sleepLogs));
  }, [sleepLogs]);

  useEffect(() => {
    localStorage.setItem('isSleeping', isSleeping.toString());
    if (sleepStartTime) {
      localStorage.setItem('sleepStartTime', sleepStartTime);
    } else {
      localStorage.removeItem('sleepStartTime');
    }
  }, [isSleeping, sleepStartTime]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSleeping && sleepStartTime) {
      interval = setInterval(() => {
        const start = new Date(sleepStartTime).getTime();
        const now = new Date().getTime();
        const diff = now - start;
        
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        setSleepDuration(
          `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSleeping, sleepStartTime]);

  const startSleep = () => {
    setIsSleeping(true);
    setSleepStartTime(new Date().toISOString());
    setWakeMessage(null);
  };

  const wakeUp = () => {
    if (!sleepStartTime) return;
    
    const start = new Date(sleepStartTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    
    const durationStr = `${h}h ${m}m`;
    const newLog = {
      date: start.toLocaleDateString(),
      start: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      end: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: durationStr
    };

    setSleepLogs(prev => [newLog, ...prev].slice(0, 7)); // Keep last 7 logs
    setIsSleeping(false);
    setSleepStartTime(null);
    setWakeMessage(`You slept ${h} hours ${m} minutes.`);
    
    // Auto-clear message after 10 seconds
    setTimeout(() => setWakeMessage(null), 10000);
  };

  const setTaskStatus = React.useCallback((id: number, status: 'completed' | 'missed') => {
    // Immediate Feedback: Scale down is handled by whileTap in the button
    // Vibration if mobile
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    if (status === 'completed') {
      setAnimatingTaskId(id);
      setShowReinforcement(true);
      playSound('success');
      setTimeout(() => setShowReinforcement(false), 800);
      
      // Wait for completion animation before moving
      setTimeout(() => {
        setStats(prev => {
          const newTasks = prev.tasks.map(t => {
            if (t.id === id) {
              let nextStreak = t.streak + 1;
              if (nextStreak === 50 || nextStreak === 100) {
                setActiveAnimation('milestone-elite');
                playSound('milestone');
              } else if (nextStreak === 10) {
                setActiveAnimation('milestone-10');
                playSound('milestone');
              } else if (t.streak === 0) {
                setActiveAnimation('streak-start');
              } else {
                setActiveAnimation('fire');
              }
              setTimeout(() => setActiveAnimation(null), (nextStreak === 50 || nextStreak === 100) ? 15000 : nextStreak === 10 ? 12000 : 6000);
              return { ...t, status, streak: nextStreak };
            }
            return t;
          });
          const newStreakHistory = [...prev.streakHistory.slice(1), 1];
          const newStats = { ...prev, tasks: newTasks, streakHistory: newStreakHistory };
          newStats.score = calculateScore(newTasks);
          return newStats;
        });
        setAnimatingTaskId(null);
      }, 1000);
    } else {
      setStats(prev => {
        let majorLossTriggered = false;
        let eliteLossTriggered = false;
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = new Date().toISOString();

        const newTasks = prev.tasks.map(t => {
          if (t.id === id) {
            if (t.streak >= 48 && t.streak <= 99) {
              eliteLossTriggered = true;
            } else if (t.streak >= 30) {
              majorLossTriggered = true;
            }
            setActiveAnimation('struggle');
            playSound('failure');
            setIsMajorLoss(majorLossTriggered);
            setIsEliteLoss(eliteLossTriggered);
            setTimeout(() => {
              setActiveAnimation(null);
              setIsMajorLoss(false);
              setIsEliteLoss(false);
            }, (majorLossTriggered || eliteLossTriggered) ? 10000 : 6000);
            return { ...t, status, streak: 0 };
          }
          return t;
        });
        
        const newFailureHistory = [...(prev.failureHistory || []), { day: today, date: dateStr }];
        const newStreakHistory = [...prev.streakHistory.slice(1), 0];
        
        const newStats = { 
          ...prev, 
          tasks: newTasks, 
          failureHistory: newFailureHistory,
          streakHistory: newStreakHistory
        };
        newStats.score = calculateScore(newStats.tasks);
        return newStats;
      });
    }
  }, [calculateScore, playSound]);

  // Notification & Expiration Scheduler
  useEffect(() => {
    // Request permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkTasks = () => {
      const now = new Date();
      const currentTimeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const [nowH, nowM] = currentTimeStr.split(':').map(Number);
      const nowMinutes = nowH * 60 + nowM;

      stats.tasks.forEach(task => {
        if (task.status !== 'pending') return;

        const [taskH, taskM] = task.time.split(':').map(Number);
        const taskMinutes = taskH * 60 + taskM;
        const taskId = task.id.toString();
        const taskNotif = notifiedTasks[taskId] || { reminded: false, expired: false };

        // 1. Reminder (1 hour before)
        if (!taskNotif.reminded && !task.isAnyTime) {
          const diff = taskMinutes - nowMinutes;
          if (diff <= 60 && diff > 0) {
            sendNotification(
              "STREAK EXPIRING",
              `Your streak for "${task.title}" expires in ${diff} minutes. Execute now.`,
              'reminded',
              taskId
            );
          }
        }

        // 2. Automatic Expiration
        if (!taskNotif.expired) {
          if (!task.isAnyTime && nowMinutes >= taskMinutes) {
            handleTaskExpiration(task.id, task.title);
          } else if (task.isAnyTime && nowH === 23 && nowM === 59) {
            // Any time tasks expire at the very end of the day
            handleTaskExpiration(task.id, task.title);
          }
        }
      });
    };

    const sendNotification = (title: string, body: string, type: 'reminded' | 'expired', taskId: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico', // Fallback icon
          silent: false
        });
        
        setNotifiedTasks(prev => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || { reminded: false, expired: false }),
            [type]: true
          }
        }));
      }
    };

    const handleTaskExpiration = (id: number, title: string) => {
      setTaskStatus(id, 'missed');
      sendNotification(
        "STREAK EXPIRED",
        `You failed to complete "${title}". Your streak has been terminated.`,
        'expired',
        id.toString()
      );
    };

    const interval = setInterval(checkTasks, 60000); // Check every minute
    checkTasks(); // Initial check

    return () => clearInterval(interval);
  }, [stats.tasks, notifiedTasks, setTaskStatus]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const isExpiringSoon = (task: any) => {
    if (task.status !== 'pending') return false;
    
    const nowH = currentTime.getHours();
    const nowM = currentTime.getMinutes();
    const nowMinutes = nowH * 60 + nowM;

    let taskMinutes;
    if (task.isAnyTime) {
      taskMinutes = 23 * 60 + 59;
    } else {
      const [h, m] = task.time.split(':').map(Number);
      taskMinutes = h * 60 + m;
    }

    const diff = taskMinutes - nowMinutes;
    return diff <= 15 && diff > 0;
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;
    
    const isFirstTask = stats.tasks.length === 0;
    
    const task = {
      id: Date.now(),
      ...newTask,
      time: newTask.isAnyTime ? 'Any time' : newTask.time,
      status: 'pending' as const,
      streak: 0
    };

    setStats(prev => {
      const newTasks = [...prev.tasks, task];
      return { ...prev, tasks: newTasks, score: calculateScore(newTasks) };
    });
    
    setIsAddingTask(false);
    setNewTask({ title: '', time: '08:00', priority: 2, isAnyTime: false });
    
    if (isFirstTask) {
      setActiveAnimation('first-task');
      setTimeout(() => setActiveAnimation(null), 6000);
    }
  };

  const deleteTask = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setStats(prev => {
      const newTasks = prev.tasks.filter(t => t.id !== id);
      return { ...prev, tasks: newTasks, score: calculateScore(newTasks) };
    });
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
      const dateStr = now.toISOString().split('T')[0];
      setTimestamp(`${dateStr} ${timeStr}`);
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAnalyze = async () => {
    if (!aiConfig.isConnected) return;
    setIsAnalyzing(true);
    
    // Auto-generate input based on current stats if input is empty
    const dataToAnalyze = input.trim() || `
      Current Discipline Score: ${stats.score}
      Tasks Status:
      ${stats.tasks.map(t => `- ${t.title}: ${t.status} (Streak: ${t.streak}D)`).join('\n')}
    `;

    const result = await analyzeDiscipline(dataToAnalyze, aiConfig.apiKey);
    setAnalysis(result);
    setIsAnalyzing(false);
    setView('ai');
  };

  const connectGemini = async () => {
    try {
      // @ts-ignore
      if (window.aistudio) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        setAiConfig({ provider: 'gemini', isConnected: true });
      }
    } catch (error) {
      console.error("Gemini connection failed", error);
    }
  };

  const connectGPT = (key: string) => {
    if (key.startsWith('sk-')) {
      setAiConfig({ provider: 'gpt', isConnected: true, apiKey: key });
    }
  };

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-1000 font-sans selection:bg-[#F97316]/30",
      isSleeping ? "bg-[#020617]" : wakeMessage ? "bg-orange-500/20" : "bg-[#0F172A]",
      "text-[#CBD5E1]"
    )}>
      {/* Sleep Mode Overlay */}
      <AnimatePresence>
        {isSleeping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center p-6"
          >
            {/* Breathing Animation Background */}
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.05, 0.15, 0.05]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-[80vw] h-[80vw] rounded-full bg-blue-500 blur-[100px] pointer-events-none"
            />

            <div className="relative z-10 flex flex-col items-center space-y-12">
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="p-6 rounded-full bg-blue-500/5 border border-blue-500/10"
              >
                <Moon size={48} className="text-blue-400" />
              </motion.div>

              <div className="text-center space-y-4">
                <div className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500/60">Sleep Protocol Active</div>
                <div className="text-7xl font-black text-white tracking-tighter tabular-nums">
                  {sleepDuration}
                </div>
              </div>

              <button 
                onClick={wakeUp}
                className="px-12 py-5 bg-white text-[#020617] rounded-full text-xs font-black uppercase tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/5"
              >
                Wake Up
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation */}
      {!isSleeping && (
        <>
          <header className="border-b border-white/5 bg-[#0F172A]/90 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-sm bg-[#F97316] shadow-[0_0_12px_rgba(249,115,22,0.4)]" />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-white">DISCIPLINE OS</span>
          </div>
          <nav className="flex gap-6">
            {['home', 'tasks', 'stats', 'ai'].map((v) => (
              <button 
                key={v}
                onClick={() => setView(v as any)} 
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-all relative py-2",
                  view === v ? "text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {v}
                {view === v && <motion.div layoutId="nav" className="absolute bottom-0 left-0 w-full h-0.5 bg-[#F97316]" />}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-8 pb-32 space-y-10">
        
        {view === 'home' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            
            {/* Wake Message */}
            <AnimatePresence>
              {wakeMessage && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-orange-500 border border-orange-400 p-6 rounded-3xl text-center space-y-2 shadow-2xl shadow-orange-500/20"
                >
                  <div className="flex justify-center mb-2">
                    <Sun size={32} className="text-white" />
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">System Wake</div>
                  <div className="text-xl font-bold text-white">{wakeMessage}</div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The Core Mascot */}
            <section className="flex flex-col items-center justify-center py-4 space-y-6">
              <div className="relative flex items-center justify-center">
                {/* Outer Glow Ring */}
                <motion.div 
                  animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.1, 0.2, 0.1]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className={cn(
                    "absolute w-32 h-32 rounded-full blur-2xl",
                    stats.consistency > 80 ? "bg-[#22C55E]" : stats.consistency > 60 ? "bg-slate-400" : "bg-[#EF4444]"
                  )}
                />
                
                {/* The Core Geometry */}
                <motion.div
                  animate={{ rotateY: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="relative z-10"
                >
                  <div className={cn(
                    "w-16 h-16 border-2 rotate-45 flex items-center justify-center transition-colors duration-1000",
                    stats.consistency > 80 ? "border-[#22C55E] shadow-[0_0_15px_rgba(34,197,94,0.3)]" : 
                    stats.consistency > 60 ? "border-slate-500 shadow-[0_0_15px_rgba(255,255,255,0.1)]" : 
                    "border-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                  )}>
                    <div className={cn(
                      "w-8 h-8 border transition-colors duration-1000",
                      stats.consistency > 80 ? "border-[#22C55E]/40" : "border-slate-500/40"
                    )} />
                  </div>
                </motion.div>
              </div>
              
              <div className="text-center space-y-1">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white">
                  {stats.consistency > 80 ? "System Optimal" : stats.consistency > 60 ? "Structure Stable" : "Integrity Compromised"}
                </div>
                <div className="text-[8px] uppercase tracking-widest text-slate-500">
                  {stats.consistency > 80 ? "Identity ascending." : stats.consistency > 60 ? "Maintain consistency." : "Rebuild required."}
                </div>
              </div>
            </section>

            {/* Discipline Score Card */}
            <motion.section 
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/40 border border-white/5 rounded-3xl p-10 text-center space-y-4 relative overflow-hidden group cursor-pointer"
            >
              {/* Animated Background Accent */}
              <motion.div 
                animate={{ 
                  opacity: [0.05, 0.1, 0.05],
                  scale: [1, 1.2, 1]
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-gradient-to-b from-[#F97316]/10 to-transparent pointer-events-none"
              />
              
              <div className="relative z-10 space-y-1">
                <h2 className="text-[10px] uppercase tracking-[0.4em] font-black text-slate-500">Discipline Score</h2>
                
                <div className="relative inline-block">
                  <motion.div 
                    key={stats.score}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-7xl font-black text-white tracking-tighter"
                  >
                    {stats.score}
                  </motion.div>
                  {/* Subtle Glow */}
                  <div className="absolute inset-0 blur-3xl bg-white/5 -z-10" />
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <div className="h-px w-8 bg-white/5" />
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20">
                    <Activity size={10} className="text-[#22C55E]" />
                    <span className="text-[10px] font-black uppercase text-[#22C55E] tracking-wider">+12 Trend</span>
                  </div>
                  <div className="h-px w-8 bg-white/5" />
                </div>
              </div>

              <div className="text-[8px] text-slate-600 uppercase tracking-widest font-bold pt-2">
                Last Sync: {timestamp.split(' ')[1]}
              </div>
            </motion.section>

            {/* Streak & Consistency Grid */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={startSleep}
                className="col-span-2 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.25em] transition-all shadow-xl shadow-blue-600/10 active:scale-[0.97]"
              >
                <Moon size={16} />
                Initiate Sleep
              </button>
              
              <div className="bg-slate-800/40 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Avg Streak</span>
                  <div className="text-2xl font-bold text-[#F97316] tracking-tighter">
                    {Math.round(stats.tasks.reduce((acc, t) => acc + t.streak, 0) / (stats.tasks.length || 1))}D
                  </div>
                </div>
                {/* Streak Integrity Bar */}
                <div className="flex gap-1.5 h-1">
                  {stats.streakHistory.map((day, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className={cn(
                        "flex-1 rounded-full transition-all duration-500",
                        day === 1 
                          ? "bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.3)]" 
                          : "bg-slate-700/50"
                      )} 
                    />
                  ))}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-white/5 p-5 rounded-2xl space-y-4">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Consistency</span>
                  <div className="text-2xl font-bold text-white tracking-tighter">{stats.consistency}%</div>
                </div>
                {/* Consistency Elite Bar */}
                <div className="h-1.5 w-full bg-slate-900/80 rounded-full overflow-hidden relative border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.consistency}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="h-full bg-gradient-to-r from-white/40 to-white shadow-[0_0_12px_rgba(255,255,255,0.3)] relative"
                  >
                    <div className="absolute right-0 top-0 h-full w-1 bg-white blur-[2px]" />
                  </motion.div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setView('tasks')}
              className="w-full py-5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.25em] transition-all shadow-xl shadow-[#F97316]/10 active:scale-[0.97]"
            >
              Manage Operations
            </button>
          </motion.div>
        )}

        {view === 'tasks' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            {/* Active Operations */}
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Active Operations</h2>
                  <button 
                    onClick={() => setIsAddingTask(true)}
                    className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <span className="text-[10px] font-bold text-slate-600">{stats.tasks.filter(t => t.status === 'completed').length}/{stats.tasks.length}</span>
              </div>

              <AnimatePresence>
                {isAddingTask && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-slate-800/60 border border-[#F97316]/20 rounded-xl p-4 space-y-3 overflow-hidden"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] uppercase font-black text-[#F97316] tracking-widest">New Operation</span>
                      <button onClick={() => setIsAddingTask(false)} className="text-slate-500 hover:text-white">
                        <X size={14} />
                      </button>
                    </div>
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Task Title"
                      value={newTask.title}
                      onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F97316]/30"
                    />
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox"
                          checked={newTask.isAnyTime}
                          onChange={e => setNewTask(prev => ({ ...prev, isAnyTime: e.target.checked }))}
                          className="w-4 h-4 rounded border-white/10 bg-slate-900 accent-[#F97316]"
                        />
                        <span className="text-[10px] uppercase font-bold text-slate-500">Any time</span>
                      </div>
                      <input 
                        type="time"
                        disabled={newTask.isAnyTime}
                        value={newTask.time}
                        onChange={e => setNewTask(prev => ({ ...prev, time: e.target.value }))}
                        className={cn(
                          "bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-sm focus:outline-none transition-opacity",
                          newTask.isAnyTime && "opacity-30"
                        )}
                      />
                    </div>
                    <button 
                      onClick={addTask}
                      className="w-full bg-[#F97316] text-white rounded-lg py-3 text-[10px] font-black uppercase tracking-widest"
                    >
                      Deploy Operation
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {stats.tasks.filter(t => t.status === 'pending').map(task => (
                    <motion.div 
                      layout
                      key={task.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ 
                        opacity: 1, 
                        x: 0,
                        height: animatingTaskId === task.id ? 0 : 'auto',
                        marginTop: animatingTaskId === task.id ? 0 : 8,
                        marginBottom: animatingTaskId === task.id ? 0 : 8,
                        overflow: 'hidden'
                      }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ 
                        duration: 0.4, 
                        ease: "circOut",
                        height: { delay: 0.6, duration: 0.4 },
                        marginTop: { delay: 0.6, duration: 0.4 },
                        marginBottom: { delay: 0.6, duration: 0.4 }
                      }}
                      className={cn(
                        "group px-5 py-4 rounded-xl border flex items-center justify-between transition-all relative",
                        animatingTaskId === task.id ? "bg-emerald-900/20 border-emerald-500/30" : "bg-slate-900/30 border-slate-800/50 hover:border-slate-700/50",
                        isExpiringSoon(task) && "border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                      )}
                    >
                      {isExpiringSoon(task) && (
                        <>
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.1, 0.4, 0.1] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-0 bg-red-500/10 rounded-xl pointer-events-none"
                          />
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.3, 0.8, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-0 border border-red-500/40 rounded-xl pointer-events-none"
                          />
                        </>
                      )}
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="space-y-0.5">
                          <div className="relative">
                            <motion.div 
                              layout
                              className={cn(
                                "text-sm font-bold tracking-tight transition-colors duration-500",
                                animatingTaskId === task.id ? "text-slate-500" : "text-slate-400 group-hover:text-slate-200"
                              )}
                            >
                              {task.title}
                            </motion.div>
                            {/* Strike-through animation */}
                            <AnimatePresence>
                              {animatingTaskId === task.id && (
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: '100%' }}
                                  className="absolute top-1/2 left-0 h-px bg-slate-500"
                                  transition={{ duration: 0.5 }}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{task.time}</div>
                            {isExpiringSoon(task) && (
                              <motion.div 
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="text-[8px] font-black text-red-500 uppercase tracking-tighter bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20"
                              >
                                Urgent: Expiring
                              </motion.div>
                            )}
                            <div className={cn(
                              "text-[10px] font-black uppercase tracking-tighter",
                              task.streak > 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                            )}>
                              {task.streak}D Streak
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 relative z-10">
                        {animatingTaskId === task.id ? (
                          <div className="w-12 h-12 flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                              <motion.path 
                                d="M20 6L9 17L4 12"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.5 }}
                              />
                            </svg>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={(e) => deleteTask(task.id, e)}
                              className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                            
                            <div className="flex gap-2">
                              <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setTaskStatus(task.id, 'completed')}
                                className="px-3 py-1.5 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] text-[10px] font-black uppercase tracking-widest hover:bg-[#22C55E] hover:text-white transition-all"
                              >
                                YES
                              </motion.button>
                              <motion.button 
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setTaskStatus(task.id, 'missed')}
                                className="px-3 py-1.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[10px] font-black uppercase tracking-widest hover:bg-[#EF4444] hover:text-white transition-all"
                              >
                                NO
                              </motion.button>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>

            {/* Completed Operations */}
            {stats.tasks.some(t => t.status !== 'pending') && (
              <section className="space-y-4">
                <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 px-1">Completed Operations</h2>
                <div className="space-y-2 opacity-60">
                  {stats.tasks.filter(t => t.status !== 'pending').map(task => (
                    <div 
                      key={task.id} 
                      className={cn(
                        "px-5 py-3 rounded-xl border flex items-center justify-between bg-slate-900/10 border-slate-800/30"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="space-y-0.5">
                          <div className={cn(
                            "text-sm font-bold tracking-tight text-slate-500 line-through"
                          )}>
                            {task.title}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">{task.time}</div>
                            <div className={cn(
                              "text-[10px] font-black uppercase tracking-tighter",
                              task.status === 'completed' ? "text-emerald-600" : "text-red-600"
                            )}>
                              {task.status}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => deleteTask(task.id, e)}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-700 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        )}

        {view === 'stats' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Intelligence Briefing</h2>
              <div className="text-[10px] font-bold text-[#22C55E] uppercase tracking-widest">Live Feed</div>
            </div>

            {/* Bento Grid Stats */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-6 bg-slate-800/40 border border-white/5 p-8 rounded-3xl flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <Activity size={24} className="text-[#F97316]/20" />
                </div>
                <div className="relative">
                  <div className="absolute inset-0 blur-3xl bg-[#F97316]/10 rounded-full" />
                  <div className="text-7xl font-black text-white tracking-tighter relative z-10">{derivedStats.consistency}%</div>
                </div>
                <div className="space-y-3 w-full max-w-[240px]">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Monthly Consistency</div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${derivedStats.consistency}%` }} 
                      className="h-full bg-gradient-to-r from-[#F97316] to-orange-400 rounded-full" 
                    />
                  </div>
                </div>
              </div>

              <div className="col-span-3 bg-slate-800/40 border border-white/5 p-6 rounded-3xl space-y-2">
                <div className="text-[9px] uppercase tracking-widest font-black text-slate-500">Peak Streak</div>
                <div className="text-3xl font-black text-white">{derivedStats.peakStreak}<span className="text-sm text-slate-500 ml-1">D</span></div>
              </div>

              <div className="col-span-3 bg-slate-800/40 border border-white/5 p-6 rounded-3xl space-y-2">
                <div className="text-[9px] uppercase tracking-widest font-black text-slate-500">Total Ops</div>
                <div className="text-3xl font-black text-white">{stats.tasks.length}</div>
              </div>

              <div className="col-span-6 bg-slate-800/40 border border-white/5 p-6 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] uppercase tracking-widest font-black text-slate-500">Streak Integrity</div>
                  <div className="text-[8px] uppercase font-bold text-slate-600">Last 7 Events</div>
                </div>
                <div className="flex gap-2 h-8 items-end">
                  {stats.streakHistory.map((val, i) => (
                    <motion.div 
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: val ? '100%' : '20%' }}
                      className={cn(
                        "flex-1 rounded-t-lg transition-all duration-500",
                        val ? "bg-[#F97316]" : "bg-slate-700/30"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="col-span-6 space-y-3">
                <div className="flex items-center justify-between px-1 pt-4">
                  <h3 className="text-[9px] uppercase tracking-widest font-black text-slate-600">Sleep Logs</h3>
                  <Clock size={12} className="text-slate-600" />
                </div>
                {sleepLogs.length > 0 ? (
                  <div className="space-y-2">
                    {sleepLogs.map((log, i) => (
                      <div key={i} className="p-4 bg-slate-800/20 border border-white/5 rounded-2xl flex justify-between items-center">
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-bold text-white uppercase tracking-tight">{log.date}</div>
                          <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest">{log.start} — {log.end}</div>
                        </div>
                        <div className="text-xs font-black text-blue-400 uppercase tracking-tighter">{log.duration}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center border border-dashed border-white/5 rounded-2xl">
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">No Sleep Data Recorded</div>
                  </div>
                )}

                <div className="h-px w-full bg-white/5 my-4" />

                {[
                  { label: 'Weakest Day', val: derivedStats.weakestDay, color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/5' },
                  { label: 'Strongest Habit', val: derivedStats.strongestHabit, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/5' },
                  { label: 'Avg. Sleep Time', val: derivedStats.avgSleep, color: 'text-white', bg: 'bg-white/5' },
                ].map((item, i) => (
                  <div key={i} className={cn("p-5 border border-white/5 rounded-2xl flex justify-between items-center transition-all hover:bg-white/5", item.bg)}>
                    <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">{item.label}</span>
                    <span className={cn("text-xs font-black uppercase tracking-widest", item.color)}>{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {view === 'ai' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">AI Diagnostic</h2>
              {analysis && (
                <button onClick={() => setAnalysis(null)} className="text-[10px] font-bold text-slate-600 uppercase hover:text-slate-400">New Audit</button>
              )}
            </div>

            {!aiConfig.isConnected ? (
              <div className="space-y-6 p-8 bg-slate-900/50 border border-white/5 rounded-3xl text-center">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity size={32} className="text-blue-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Intelligence Module Offline</h3>
                  <p className="text-slate-400 text-xs max-w-xs mx-auto">To enable diagnostic capabilities, you must connect your own Intelligence API.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-4">
                  <button 
                    onClick={connectGemini}
                    className="p-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                  >
                    Connect Gemini (AI Studio)
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="password"
                      placeholder="Enter OpenAI API Key (sk-...)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') connectGPT((e.target as HTMLInputElement).value);
                      }}
                      className="w-full p-4 bg-slate-800/50 border border-white/10 rounded-2xl text-[10px] text-white focus:outline-none focus:border-blue-500/50 placeholder:text-slate-600"
                    />
                    <div className="mt-2 text-[8px] text-slate-600 uppercase font-black tracking-widest">Press Enter to Connect GPT</div>
                  </div>
                </div>
              </div>
            ) : !analysis ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">
                    {aiConfig.provider === 'gemini' ? 'Gemini Connected' : 'GPT Connected'}
                  </span>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe failure patterns or input weekly logs..."
                  className="w-full h-48 bg-slate-900/50 border border-white/5 rounded-2xl p-6 text-sm text-white focus:outline-none focus:border-[#F97316]/30 transition-all resize-none placeholder:text-slate-700"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !input.trim()}
                  className="w-full py-5 bg-white text-[#0F172A] rounded-2xl text-[11px] font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : "Execute Diagnostic"}
                </button>
              </div>
            ) : (
              <div className="bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-8 prose prose-invert prose-sm max-w-none">
                  <div className="markdown-body text-slate-200 text-sm leading-relaxed">
                    <Markdown>{analysis}</Markdown>
                  </div>
                </div>
                <div className="bg-[#F97316]/5 p-5 border-t border-white/5">
                  <div className="flex items-center justify-center gap-2 text-[10px] font-black text-[#F97316] uppercase tracking-widest">
                    <AlertCircle size={14} /> Corrective Action Required
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Persistent Footer */}
      <footer className="fixed bottom-0 left-0 w-full bg-[#0F172A]/95 backdrop-blur-xl border-t border-white/5 p-5 z-30">
        <div className="max-w-md mx-auto flex justify-between items-center px-2">
          <div className="space-y-0.5">
            <span className="text-[8px] uppercase font-black text-slate-600 tracking-widest">System Time</span>
            <div className="text-[11px] font-bold text-slate-400 tabular-nums">{timestamp.split(' ')[1]}</div>
          </div>
          <div className="text-right space-y-0.5">
            <span className="text-[8px] uppercase font-black text-slate-600 tracking-widest">Status</span>
            <div className="text-[11px] font-black text-[#22C55E] uppercase tracking-tighter">Ascending</div>
          </div>
        </div>
      </footer>
      </>
      )}

      {/* Reinforcement Overlay */}
      <AnimatePresence>
        {showReinforcement && !activeAnimation && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-[110] pointer-events-none"
          >
            <div className="bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 rounded-full backdrop-blur-md">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Discipline +1</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Screen Animations */}
      <AnimatePresence>
        {activeAnimation === 'milestone-elite' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="fixed inset-0 z-[200] bg-black flex items-center justify-center overflow-hidden"
          >
            {/* Background Cinematic Visual (Simulating Video) */}
            <motion.div 
              initial={{ scale: 1.1 }}
              animate={{ scale: 1.2, x: [0, 10, -10, 0], y: [0, -5, 5, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 opacity-60"
            >
              <img 
                src="https://images.unsplash.com/photo-1552674605-db6ffd4facb5?q=80&w=2070&auto=format&fit=crop" 
                alt="Victory" 
                className="w-full h-full object-cover grayscale"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            <div className="absolute inset-0 bg-black/40" />

            <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-20 px-10 text-center">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="space-y-4"
              >
                <h1 className="text-2xl font-bold text-white tracking-tight max-w-md">
                  Men weren't made for comfort.<br />
                  Men were made for victory.
                </h1>
              </motion.div>

              <div className="mt-auto pb-20">
                <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Devil Hustle</div>
              </div>
            </div>

            {/* Grain & Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
          </motion.div>
        )}

        {activeAnimation === 'milestone-10' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="fixed inset-0 z-[200] bg-black flex items-center justify-center overflow-hidden"
          >
            {/* Background Cinematic Visual */}
            <motion.div 
              initial={{ scale: 1 }}
              animate={{ scale: 1.15 }}
              transition={{ duration: 12, ease: "linear" }}
              className="absolute inset-0 opacity-50"
            >
              <img 
                src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop" 
                alt="Training" 
                className="w-full h-full object-cover grayscale"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-20 px-10 text-center">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="space-y-4"
              >
                <h1 className="text-2xl font-bold text-white tracking-tight max-w-md">
                  Push yourself so far,<br />
                  that even your family thinks you've lost your mind
                </h1>
              </motion.div>

              <div className="mt-auto pb-20">
                <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Power Moves</div>
              </div>
            </div>
          </motion.div>
        )}

        {activeAnimation === 'fire' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <div className="relative w-full h-full">
              <img 
                src="https://picsum.photos/seed/fire/1920/1080?blur=2" 
                alt="Fire" 
                className="w-full h-full object-cover opacity-40 mix-blend-screen"
                referrerPolicy="no-referrer"
              />
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center p-10"
              >
                <div className="text-8xl mb-4">🔥</div>
                <h1 className="text-4xl font-black text-white uppercase tracking-[0.5em]">Identity Ascending</h1>
                <p className="text-[#F97316] font-bold uppercase tracking-widest mt-4">System Optimal. Keep Pushing.</p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {activeAnimation === 'first-task' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-950 flex items-center justify-center p-10 text-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-6"
            >
              <div className="w-20 h-20 bg-orange-500/20 rounded-2xl border border-orange-500/30 flex items-center justify-center mx-auto mb-8">
                <Plus size={40} className="text-orange-500" />
              </div>
              <h1 className="text-4xl font-black text-white uppercase tracking-widest">Operation Deployed</h1>
              <p className="text-slate-400 font-medium max-w-xs mx-auto">The first step is the hardest. You have officially entered the system.</p>
              <div className="text-[10px] font-black text-orange-500 uppercase tracking-[0.4em] pt-4">No Turning Back.</div>
            </motion.div>
          </motion.div>
        )}

        {activeAnimation === 'streak-start' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-emerald-950/90 backdrop-blur-md flex items-center justify-center p-10 text-center"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-6"
            >
              <div className="text-6xl mb-4">🌱</div>
              <h1 className="text-4xl font-black text-emerald-400 uppercase tracking-widest">Streak Initiated</h1>
              <p className="text-white font-bold uppercase tracking-widest">Day 1 of a new life.</p>
              <div className="h-px w-12 bg-emerald-500/30 mx-auto" />
              <div className="text-[10px] text-emerald-500 uppercase tracking-[0.4em]">Momentum is Building.</div>
            </motion.div>
          </motion.div>
        )}

        {activeAnimation === 'struggle' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className={cn(
              "fixed inset-0 z-[200] pointer-events-none flex items-center justify-center transition-colors duration-1000",
              (isMajorLoss || isEliteLoss) ? "bg-black" : "bg-black/80 backdrop-blur-md"
            )}
          >
            <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
              {isEliteLoss ? (
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-20 px-10 text-center">
                  <motion.div 
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 10 }}
                    className="absolute inset-0 opacity-40"
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=2070&auto=format&fit=crop" 
                      alt="Elite Loss" 
                      className="w-full h-full object-cover grayscale"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 1 }}
                    className="relative z-20 space-y-12"
                  >
                    <h2 className="text-2xl font-bold text-white tracking-tight">You're not weak.</h2>
                    
                    <div className="pt-20 space-y-4">
                      <h1 className="text-xl font-bold text-white tracking-tight max-w-xs mx-auto leading-relaxed">
                        Your mindset is,<br />
                        the one that keeps pushing today to tomorrow.
                      </h1>
                    </div>
                  </motion.div>

                  <div className="mt-auto pb-20 relative z-20">
                    <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Power Moves</div>
                  </div>
                </div>
              ) : isMajorLoss ? (
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-20 px-10 text-center">
                  <motion.div 
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.1 }}
                    transition={{ duration: 10 }}
                    className="absolute inset-0 opacity-30"
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=2070&auto=format&fit=crop" 
                      alt="The Lie" 
                      className="w-full h-full object-cover grayscale"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 1 }}
                    className="relative z-20 space-y-20"
                  >
                    <h2 className="text-2xl font-bold text-white tracking-tight">What is the most expensive lie on earth?</h2>
                    
                    <motion.h1 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2, duration: 1 }}
                      className="text-2xl font-bold text-white tracking-tight"
                    >
                      I will start Tomorrow.
                    </motion.h1>
                  </motion.div>

                  <div className="mt-auto pb-20 relative z-20">
                    <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Power Moves</div>
                  </div>
                </div>
              ) : (
                <motion.div
                  className="relative z-10 flex flex-col items-center"
                >
                  <img 
                    src="https://picsum.photos/seed/struggle/800/800?grayscale" 
                    alt="Struggle" 
                    className="w-64 h-64 object-cover rounded-full border-4 border-[#EF4444]/30 mb-8 grayscale opacity-60"
                    referrerPolicy="no-referrer"
                  />
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-center"
                  >
                    <h1 className="text-4xl font-black text-[#EF4444] uppercase tracking-[0.3em]">Integrity Breach</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest mt-4">The weak version of you just won.</p>
                    <div className="mt-8 text-[10px] text-slate-600 uppercase tracking-[0.4em]">Rebuild Required.</div>
                  </motion.div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
