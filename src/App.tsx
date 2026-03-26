import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Briefcase, 
  Building2, 
  LineChart, 
  Lightbulb, 
  Play, 
  Square, 
  MessageSquare,
  Trash2,
  GripVertical,
  Bot,
  Plus,
  X,
  Edit2,
  Upload,
  FileText,
  Download,
  Search,
  Brain,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Agent = {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  contextFiles?: { name: string; content: string }[];
};

type Message = {
  id: string;
  agentId: string | 'system' | 'user';
  agentName: string;
  text: string;
  timestamp: Date;
  groundingUrls?: { uri: string; title: string }[];
};

type GeneratedFile = {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
  createdBy: string;
  type?: 'uploaded' | 'generated';
};

type CollaborationMode = 'sequential' | 'parallel' | 'round-robin';

import { Type, FunctionDeclaration, ThinkingLevel, Modality } from '@google/genai';

const createFileDeclaration: FunctionDeclaration = {
  name: 'createFile',
  description: 'ONLY use this tool if the user explicitly requests a file, report, document, or code to be saved. Do not use it for general discussion or sharing ideas.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'The name of the file, including extension (e.g., report.md, strategy.txt)',
      },
      content: {
        type: Type.STRING,
        description: 'The full content of the file to be saved.',
      },
    },
    required: ['name', 'content'],
  },
};

// --- Predefined Agents ---
const INITIAL_AGENTS: Agent[] = [
  {
    id: 'sales-expert',
    name: 'Sarah (Sales)',
    role: 'Sales Expert',
    description: 'Aggressive, revenue-focused, prioritizes customer acquisition, conversion rates, and closing deals quickly.',
    icon: LineChart,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  {
    id: 'tholons-agent',
    name: 'Beppo (BPO)',
    role: 'Global Business Strategy',
    description: 'Strategic, focuses on global operations, outsourcing, digital transformation, and macro-economic business trends.',
    icon: Briefcase,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 'deloitte-si',
    name: 'Simone (SI)',
    role: 'Systems Integrator',
    description: 'Process-oriented, focuses on enterprise architecture, risk mitigation, compliance, and scalable technical implementation.',
    icon: Building2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    id: 'marketing-guru',
    name: 'Mia (Marketing)',
    role: 'Brand & Marketing',
    description: 'Creative, focuses on brand messaging, target audience engagement, market positioning, and campaign virality.',
    icon: Lightbulb,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    id: 'tech-lead',
    name: 'Linus (Tech Lead)',
    role: 'Engineering',
    description: 'Pragmatic, focuses on technical feasibility, performance, architecture, and avoiding technical debt.',
    icon: Bot,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  }
];

// --- AI Setup ---
// We now call the backend API instead of initializing the SDK on the client
const callAI = async (model: string, contents: any, config: any, apiKey?: string) => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, config, apiKey })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.error || 'AI request failed');
    (error as any).status = response.status;
    throw error;
  }
  
  return await response.json();
};

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [availableAgents, setAvailableAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [arenaAgents, setArenaAgents] = useState<Agent[]>([]);
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('arena_messages');
    if (saved) {
      try {
        return JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch (e) {}
    }
    return [];
  });
  
  const [files, setFiles] = useState<GeneratedFile[]>(() => {
    const saved = localStorage.getItem('arena_files');
    if (saved) {
      try {
        return JSON.parse(saved).map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
      } catch (e) {}
    }
    return [];
  });

  const [task, setTask] = useState('Create a go-to-market strategy for our new enterprise AI product.');
  const [userInput, setUserInput] = useState('');
  const [collaborationMode, setCollaborationMode] = useState<CollaborationMode>('sequential');
  const [isDiscussing, setIsDiscussing] = useState(false);
  const isDiscussingRef = useRef(false);
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [manualApiKey, setManualApiKey] = useState(() => localStorage.getItem('arena_manual_api_key') || '');

  // New Feature States
  const [useSearch, setUseSearch] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useTTS, setUseTTS] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const localKey = localStorage.getItem('arena_manual_api_key');
        setHasApiKey(data.hasKey || (!!localKey && localKey.length > 10));
      } catch (e) {
        console.error("Failed to check server config", e);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Force a reload to ensure the new process.env.API_KEY is picked up
        window.location.reload();
      } catch (error) {
        console.error("Failed to open key selector", error);
      }
    }
  };

  const speakText = async (text: string) => {
    if (!useTTS) return;
    try {
      setIsSpeaking(true);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey: manualApiKey })
      });

      if (!response.ok) throw new Error('TTS request failed');
      const { audio: base64Audio } = await response.json();

      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('arena_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('arena_files', JSON.stringify(files));
  }, [files]);
  
  // Create/Edit Agent Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentFiles, setNewAgentFiles] = useState<{ name: string; content: string }[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, speakingAgentId]);

  const handleGlobalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const newFile: GeneratedFile = {
          id: Date.now().toString() + Math.random().toString(),
          name: file.name,
          content: content,
          createdAt: new Date(),
          createdBy: 'User',
          type: 'uploaded'
        };
        setFiles(prev => [...prev, newFile]);
      };
      reader.readAsText(file);
    });
    if (globalFileInputRef.current) {
      globalFileInputRef.current.value = '';
    }
  };

  const handleDownloadFile = (file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, agentId: string) => {
    e.dataTransfer.setData('agentId', agentId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const agentId = e.dataTransfer.getData('agentId');
    const agent = availableAgents.find(a => a.id === agentId);
    
    if (agent && !arenaAgents.find(a => a.id === agentId)) {
      setArenaAgents([...arenaAgents, agent]);
    }
  };

  const removeAgent = (id: string) => {
    setArenaAgents(arenaAgents.filter(a => a.id !== id));
  };

  // --- Discussion Logic ---
  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    
    const newUserMsg: Message = {
      id: Date.now().toString(),
      agentId: 'user',
      agentName: 'User',
      text: userInput,
      timestamp: new Date()
    };
    
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setUserInput('');
    
    if (arenaAgents.length > 0 && !isDiscussingRef.current) {
      startDiscussion(newMessages);
    }
  };

  const startDiscussion = async (startingMessages = messages) => {
    if (arenaAgents.length === 0) {
      alert("Please drag at least one agent into the conclave first.");
      return;
    }

    setIsDiscussing(true);
    isDiscussingRef.current = true;
    
    let currentHistory = [...startingMessages];

    // Determine which agents should respond based on mentions or group asks
    const lastUserMsg = [...startingMessages].reverse().find(m => m.agentId === 'user');
    let agentsToRespond = [...arenaAgents];
    
    if (lastUserMsg) {
      const text = lastUserMsg.text.toLowerCase();
      
      // Look for explicit @ mentions (e.g., @Sarah)
      const explicitMentions = arenaAgents.filter(agent => {
        // Split name into parts to catch "Sarah" from "Sarah (Sales)"
        const nameParts = agent.name.toLowerCase().split(/[\s()]+/);
        return nameParts.some(part => part.length > 2 && text.includes(`@${part}`));
      });

      if (explicitMentions.length > 0) {
        // If there are @ mentions, ONLY those agents respond
        agentsToRespond = explicitMentions;
      } else {
        // Fallback to general mentions and group asks
        const mentionedAgents = arenaAgents.filter(agent => 
          text.includes(agent.name.toLowerCase()) ||
          text.includes(agent.role.toLowerCase())
        );
        
        const groupKeywords = ['everyone', 'all', 'team', 'group', 'conclave', 'anybody', 'somebody', 'any of you'];
        const isGroupAsk = groupKeywords.some(k => text.includes(k));

        if (mentionedAgents.length > 0 && !isGroupAsk) {
          // ONLY mentioned agents respond
          agentsToRespond = mentionedAgents;
        } else if (mentionedAgents.length > 0 && isGroupAsk) {
          // Everyone responds, but mentioned ones go first
          const otherAgents = arenaAgents.filter(agent => !mentionedAgents.includes(agent));
          agentsToRespond = [...mentionedAgents, ...otherAgents];
        }
        // If no mentions and no group ask, default to everyone (current behavior)
      }
    }
    
    // If starting fresh with no messages, add the task as the first message
    if (currentHistory.length === 0 && task.trim()) {
      const taskMsg: Message = {
        id: Date.now().toString(),
        agentId: 'user',
        agentName: 'User (Task)',
        text: task,
        timestamp: new Date()
      };
      currentHistory.push(taskMsg);
      setMessages(currentHistory);
    }

    const generateAgentResponse = async (agent: Agent, history: Message[]): Promise<Message | null> => {
      try {
        let contextFilesContent = '';
        if (agent.contextFiles && agent.contextFiles.length > 0) {
          contextFilesContent = `\n\nAdditional Knowledge Base:\n${agent.contextFiles.map(f => `--- File: ${f.name} ---\n${f.content}\n`).join('\n')}`;
        }

        const uploadedFiles = files.filter(f => f.type === 'uploaded');
        let globalFilesContent = '';
        if (uploadedFiles.length > 0) {
          globalFilesContent = `\n\nGlobal Knowledge Base (Uploaded Files):\n${uploadedFiles.map(f => `--- File: ${f.name} ---\n${f.content}\n`).join('\n')}`;
        }

        const prompt = `You are acting as a specific persona in a virtual collaboration conclave.
Persona Name: ${agent.name}
Role: ${agent.role}
Persona Description: ${agent.description}${contextFilesContent}${globalFilesContent}

Current Task/Topic: ${task}

Conversation History so far:
${history.map(m => `[${m.agentName}]: ${m.text}`).join('\n')}

Instructions:
1. PRIORITIZE DISCUSSION: Your primary goal is to engage in a human-like discussion. Share your thoughts, provide inputs, and present your persona's unique viewpoint.
2. DEBATE & COLLABORATE: Acknowledge what others have said. Challenge their ideas if they conflict with your priorities, or build upon them if they align. Aim for a logical and flowing conversation.
3. NO UNPROMPTED FILES: Do NOT use the createFile tool unless the user has specifically asked for a file, report, or document to be generated. If you are just discussing, stick to text.
4. BE CONCISE: Keep your response professional and conversational (under 150 words).
5. STAY IN CHARACTER: Do not break character. Do not say "As an AI...".
6. EXPLAIN ACTIONS: If (and only if) you are explicitly asked to generate a file, provide a text response explaining what the file contains and why you created it.`;

        // Determine model and config based on features
        let modelName = 'gemini-3-flash-preview';
        let config: any = {
          tools: [{ functionDeclarations: [createFileDeclaration] }]
        };

        if (useThinking) {
          modelName = 'gemini-3.1-pro-preview';
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        } else if (useSearch) {
          modelName = 'gemini-3-flash-preview';
          config.tools.push({ googleSearch: {} });
        }

        const response = await callAI(modelName, prompt, config, manualApiKey);

        let responseText = response.text || "";
        
        // Extract grounding URLs
        const groundingUrls: { uri: string; title: string }[] = [];
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          chunks.forEach((chunk: any) => {
            if (chunk.web) {
              groundingUrls.push({ uri: chunk.web.uri, title: chunk.web.title });
            }
          });
        }

        const functionCalls = response.functionCalls;
        if (functionCalls) {
          for (const call of functionCalls) {
            if (call.name === 'createFile') {
              const args = call.args as any;
              const newFile: GeneratedFile = {
                id: Date.now().toString() + Math.random().toString(),
                name: args.name,
                content: args.content,
                createdAt: new Date(),
                createdBy: agent.name,
                type: 'generated'
              };
              setFiles(prev => [...prev, newFile]);
              
              // If the model didn't provide much text, add a fallback
              if (responseText.length < 20) {
                responseText = `I've generated a new file: ${args.name}. ${responseText}`;
              } else {
                responseText += `\n\n*[Created file: ${args.name}]*`;
              }
            }
          }
        }
        
        if (!responseText.trim()) {
           responseText = "I agree with the current direction.";
        }
        
        const newMessage: Message = {
          id: Date.now().toString() + Math.random(),
          agentId: agent.id,
          agentName: agent.name,
          text: responseText,
          timestamp: new Date(),
          groundingUrls: groundingUrls.length > 0 ? groundingUrls : undefined
        };

        // Trigger TTS if enabled
        if (useTTS) {
          await speakText(responseText);
        }
        
        return newMessage;
      } catch (error: any) {
        console.error("Error generating response for", agent.name, error);
        
        // If the error indicates an invalid or unauthorized key, prompt for selection
        const isKeyError = 
          error?.message?.includes('API key not valid') || 
          error?.message?.includes('INVALID_ARGUMENT') || 
          error?.message?.includes('Forbidden') || 
          error?.message?.includes('403');

        if (isKeyError) {
          setHasApiKey(false);
          setManualApiKey('');
          localStorage.removeItem('arena_manual_api_key');
        }

        const errorMessage: Message = {
          id: Date.now().toString() + Math.random(),
          agentId: 'system',
          agentName: 'System',
          text: `Error getting response from ${agent.name}: ${error?.message || error}. ${
            isKeyError
            ? "This usually means a valid or authorized API key is missing. Please click the pulsing bot icon in the roster to select a paid key." 
            : ""
          }`,
          timestamp: new Date()
        };
        return errorMessage;
      }
    };

    if (collaborationMode === 'parallel') {
      setSpeakingAgentId('all');
      
      const promises = agentsToRespond.map(agent => generateAgentResponse(agent, currentHistory));
      const newMessages = await Promise.all(promises);
      
      if (isDiscussingRef.current) {
        currentHistory = [...currentHistory, ...(newMessages.filter(Boolean) as Message[])];
        setMessages(currentHistory);
      }
      
    } else if (collaborationMode === 'round-robin') {
      let turnIndex = 0;
      while (isDiscussingRef.current) {
        const agent = agentsToRespond[turnIndex % agentsToRespond.length];
        setSpeakingAgentId(agent.id);
        
        const newMsg = await generateAgentResponse(agent, currentHistory);
        if (newMsg && isDiscussingRef.current) {
          currentHistory = [...currentHistory, newMsg];
          setMessages(currentHistory);
        }
        
        turnIndex++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } else {
      // Sequential (current)
      for (const agent of agentsToRespond) {
        if (!isDiscussingRef.current) break; // Allow stopping
        
        setSpeakingAgentId(agent.id);
        
        const newMsg = await generateAgentResponse(agent, currentHistory);
        if (newMsg && isDiscussingRef.current) {
          currentHistory = [...currentHistory, newMsg];
          setMessages(currentHistory);
        }
        
        // Small pause between speakers for UX
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setSpeakingAgentId(null);
    setIsDiscussing(false);
    isDiscussingRef.current = false;
  };

  const stopDiscussion = () => {
    setIsDiscussing(false);
    isDiscussingRef.current = false;
    setSpeakingAgentId(null);
  };

  const clearArena = () => {
    setArenaAgents([]);
    setMessages([]);
  };

  const openCreateModal = () => {
    setEditingAgentId(null);
    setNewAgentName('');
    setNewAgentRole('');
    setNewAgentDesc('');
    setNewAgentFiles([]);
    setShowCreateModal(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgentId(agent.id);
    setNewAgentName(agent.name);
    setNewAgentRole(agent.role);
    setNewAgentDesc(agent.description);
    setNewAgentFiles(agent.contextFiles || []);
    setShowCreateModal(true);
  };

  const handleCreateOrEditAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName || !newAgentRole || !newAgentDesc) return;
    
    if (editingAgentId) {
      // Edit existing agent
      setAvailableAgents(availableAgents.map(a => 
        a.id === editingAgentId 
          ? { ...a, name: newAgentName, role: newAgentRole, description: newAgentDesc, contextFiles: newAgentFiles }
          : a
      ));
      
      // Also update in arena if they are there
      setArenaAgents(arenaAgents.map(a => 
        a.id === editingAgentId 
          ? { ...a, name: newAgentName, role: newAgentRole, description: newAgentDesc, contextFiles: newAgentFiles }
          : a
      ));
    } else {
      // Create new agent
      const colors = [
        { color: 'text-pink-600', bgColor: 'bg-pink-100' },
        { color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
        { color: 'text-amber-600', bgColor: 'bg-amber-100' },
        { color: 'text-rose-600', bgColor: 'bg-rose-100' },
        { color: 'text-teal-600', bgColor: 'bg-teal-100' }
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newAgent: Agent = {
        id: `custom-${Date.now()}`,
        name: newAgentName,
        role: newAgentRole,
        description: newAgentDesc,
        contextFiles: newAgentFiles,
        icon: Bot,
        ...randomColor
      };

      setAvailableAgents([...availableAgents, newAgent]);
    }

    setShowCreateModal(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files as FileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setNewAgentFiles(prev => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setNewAgentFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* --- Left Sidebar: Available Agents --- */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-slate-100">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <Users className="w-6 h-6 text-indigo-600" />
              Agent Roster
            </h1>
            <div className="flex gap-2">
              {!hasApiKey && (
                <button 
                  onClick={handleSelectKey}
                  className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors animate-pulse"
                  title="Select API Key"
                >
                  <Bot className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={openCreateModal}
                className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                title="Create new agent"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          {!hasApiKey && (
            <div className="mt-3 space-y-2">
              <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-[10px] text-amber-700 font-medium leading-tight">
                  API Key required for agents to respond. Click the icon above to select your paid key, or enter it manually below.
                </p>
              </div>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter API Key manually..."
                  value={manualApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualApiKey(val);
                    localStorage.setItem('arena_manual_api_key', val);
                    if (val.length > 10) setHasApiKey(true);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
          <p className="text-sm text-slate-500 mt-2">
            Drag agents into the conclave to build your task force.
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {availableAgents.map((agent) => {
            const isSelected = arenaAgents.some(a => a.id === agent.id);
            return (
              <div
                key={agent.id}
                draggable={!isSelected}
                onDragStart={(e) => handleDragStart(e, agent.id)}
                className={cn(
                  "p-4 rounded-xl border transition-all duration-200",
                  isSelected 
                    ? "opacity-50 border-slate-200 bg-slate-50 cursor-not-allowed" 
                    : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md cursor-grab active:cursor-grabbing"
                )}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className={cn("p-2 rounded-lg mt-1 shrink-0", agent.bgColor, agent.color)}>
                    <agent.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-slate-800 truncate pr-2">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(agent);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Edit Agent"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!isSelected && (
                          <div className="p-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-500 mb-1 truncate">{agent.role}</p>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {agent.description}
                    </p>
                    {agent.contextFiles && agent.contextFiles.length > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md w-fit">
                        <FileText className="w-3 h-3" />
                        {agent.contextFiles.length} Knowledge File{agent.contextFiles.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col h-full bg-slate-50/50">
        <audio ref={audioRef} className="hidden" />
        
        {/* Top Half: The Conclave */}
        <div className="h-2/5 min-h-[300px] p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-slate-800">Conclave</h2>
              <div className="h-6 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseSearch(!useSearch)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                    useSearch ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                  )}
                  title="Google Search Grounding"
                >
                  <Search className="w-3 h-3" />
                  Search
                </button>
                <button
                  onClick={() => setUseThinking(!useThinking)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                    useThinking ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                  )}
                  title="High Thinking Mode"
                >
                  <Brain className="w-3 h-3" />
                  Thinking
                </button>
                <button
                  onClick={() => {
                    if (isSpeaking) stopSpeaking();
                    setUseTTS(!useTTS);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                    useTTS ? "bg-orange-100 text-orange-700 border border-orange-200" : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                  )}
                  title="Text-to-Speech"
                >
                  {isSpeaking ? <Volume2 className="w-3 h-3 animate-pulse" /> : <VolumeX className="w-3 h-3" />}
                  TTS
                </button>
              </div>
            </div>
            {arenaAgents.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                  {(['sequential', 'parallel', 'round-robin'] as CollaborationMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setCollaborationMode(mode)}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                        collaborationMode === mode ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {mode.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={clearArena}
                  className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Clear Conclave
                </button>
              </div>
            )}
          </div>
          
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "flex-1 rounded-2xl border-2 border-dashed transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center p-8",
              arenaAgents.length === 0 
                ? "border-slate-300 bg-slate-100/50" 
                : "border-indigo-200 bg-indigo-50/30"
            )}
          >
            {arenaAgents.length === 0 ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Users className="w-8 h-8" />
                </div>
                <p className="text-slate-500 font-medium">Drop agents here</p>
              </div>
            ) : (
              <div className="w-full h-full relative flex items-center justify-center">
                {/* Visual "Table" */}
                <div className="absolute w-3/4 h-32 bg-white/60 rounded-[100px] shadow-inner border border-white/80 backdrop-blur-sm" />
                
                {/* Agents around the table */}
                <div className="relative w-full max-w-3xl flex justify-center gap-8 flex-wrap z-10">
                  <AnimatePresence>
                    {arenaAgents.map((agent, index) => {
                      const isSpeaking = speakingAgentId === agent.id;
                      return (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8, y: -20 }}
                          key={agent.id}
                          className="relative group"
                        >
                          <div className={cn(
                            "flex flex-col items-center p-4 rounded-2xl transition-all duration-300 bg-white shadow-sm border",
                            isSpeaking ? "border-indigo-400 shadow-md scale-105" : "border-slate-200 hover:border-slate-300"
                          )}>
                            <button 
                              onClick={() => removeAgent(agent.id)}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-slate-200"
                            >
                              &times;
                            </button>
                            <div className={cn(
                              "w-16 h-16 rounded-full flex items-center justify-center mb-3 transition-colors",
                              agent.bgColor, agent.color,
                              isSpeaking && "ring-4 ring-indigo-100"
                            )}>
                              <agent.icon className="w-8 h-8" />
                            </div>
                            <span className="font-semibold text-sm text-slate-800">{agent.name}</span>
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mt-1">{agent.role}</span>
                            
                            {isSpeaking && (
                              <div className="absolute -bottom-3 flex gap-1">
                                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Half: Discussion */}
        <div className="flex-1 flex flex-col bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-20 overflow-hidden">
          
          {/* Discussion Log */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                <p>The discussion log is empty.</p>
                <p className="text-sm mt-1">Add agents and send a message to start.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.agentId === 'user';
                const isSystem = msg.agentId === 'system';
                const agent = availableAgents.find(a => a.id === msg.agentId);

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="px-3 py-1 bg-red-50 text-red-600 text-xs rounded-full font-medium">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id} 
                    className={cn(
                      "flex gap-4 max-w-4xl",
                      isUser ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border",
                      isUser ? "bg-slate-800 text-white border-slate-700" : agent ? cn(agent.bgColor, agent.color, "border-white") : "bg-slate-200"
                    )}>
                      {isUser ? <Users className="w-5 h-5" /> : agent ? <agent.icon className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    
                    {/* Message Body */}
                    <div className={cn(
                      "flex flex-col",
                      isUser ? "items-end" : "items-start"
                    )}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-sm text-slate-700">{msg.agentName}</span>
                        <span className="text-[10px] text-slate-400">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                        isUser 
                          ? "bg-slate-800 text-slate-50 rounded-tr-none" 
                          : "bg-white border border-slate-100 rounded-tl-none text-slate-700"
                      )}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                        
                        {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Search className="w-3 h-3" />
                              Sources
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {msg.groundingUrls.map((url, i) => (
                                <a 
                                  key={i}
                                  href={url.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 px-2 py-1 rounded border border-slate-200 hover:border-indigo-200 transition-all truncate max-w-[150px]"
                                  title={url.title}
                                >
                                  {url.title || url.uri}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
            
            {/* Typing Indicator */}
            {isDiscussing && speakingAgentId && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4 max-w-4xl"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-white shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-xs text-slate-400 font-medium">
                    {speakingAgentId === 'all' ? 'All agents are typing...' : `${availableAgents.find(a => a.id === speakingAgentId)?.name} is typing...`}
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode:</span>
                <select
                  value={collaborationMode}
                  onChange={(e) => setCollaborationMode(e.target.value as CollaborationMode)}
                  disabled={isDiscussing}
                  className="text-sm py-1 px-2 rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="sequential">Sequential Discussion</option>
                  <option value="parallel">Parallel Brainstorming</option>
                  <option value="round-robin">Round-Robin Feedback</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <textarea
                  value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type your message or task here..."
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSendMessage}
                disabled={!userInput.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors shadow-sm"
              >
                Send
              </button>
              {!isDiscussing ? (
                <button
                  onClick={() => startDiscussion()}
                  disabled={arenaAgents.length === 0 || messages.length === 0}
                  className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors shadow-sm"
                  title="Let agents discuss"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={stopDiscussion}
                  className="flex items-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-sm"
                  title="Stop discussion"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* --- Right Sidebar: File Library --- */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <FileText className="w-6 h-6 text-indigo-600" />
              File Library
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Files generated by agents or uploaded by you.
            </p>
          </div>
          <button 
            onClick={() => globalFileInputRef.current?.click()}
            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
            title="Upload File"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input 
            type="file" 
            multiple 
            ref={globalFileInputRef} 
            onChange={handleGlobalFileUpload} 
            className="hidden" 
          />
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Uploaded Files Section */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Uploaded Files</h2>
            {files.filter(f => f.type === 'uploaded').length === 0 ? (
              <p className="text-xs text-slate-400 italic">No files uploaded.</p>
            ) : (
              <div className="space-y-3">
                {files.filter(f => f.type === 'uploaded').map((file) => (
                  <div key={file.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all duration-200">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-semibold text-slate-800 truncate pr-2" title={file.name}>
                            {file.name}
                          </h3>
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors shrink-0"
                            title="Download File"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          By {file.createdBy} • {file.createdAt.toLocaleDateString()}
                        </p>
                        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 max-h-24 overflow-y-auto whitespace-pre-wrap">
                          {file.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generated Files Section */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Generated Files</h2>
            {files.filter(f => f.type !== 'uploaded').length === 0 ? (
              <p className="text-xs text-slate-400 italic">No files generated yet.</p>
            ) : (
              <div className="space-y-3">
                {files.filter(f => f.type !== 'uploaded').map((file) => (
                  <div key={file.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all duration-200">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-semibold text-slate-800 truncate pr-2" title={file.name}>
                            {file.name}
                          </h3>
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors shrink-0"
                            title="Download File"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          By {file.createdBy} • {file.createdAt.toLocaleDateString()}
                        </p>
                        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 max-h-24 overflow-y-auto whitespace-pre-wrap">
                          {file.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Create/Edit Agent Modal --- */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <h2 className="text-lg font-bold text-slate-800">
                  {editingAgentId ? 'Edit Agent' : 'Create Custom Agent'}
                </h2>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="overflow-y-auto p-6">
                <form id="agent-form" onSubmit={handleCreateOrEditAgent} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Agent Name</label>
                      <input 
                        type="text" 
                        required
                        value={newAgentName}
                        onChange={e => setNewAgentName(e.target.value)}
                        placeholder="e.g. Alex (Legal)"
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                      <input 
                        type="text" 
                        required
                        value={newAgentRole}
                        onChange={e => setNewAgentRole(e.target.value)}
                        placeholder="e.g. Legal Advisor"
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Persona Description</label>
                    <textarea 
                      required
                      value={newAgentDesc}
                      onChange={e => setNewAgentDesc(e.target.value)}
                      placeholder="Describe how this agent behaves, what they prioritize, and their area of expertise..."
                      rows={3}
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all"
                    />
                  </div>

                  {/* Knowledge Base Upload */}
                  <div className="border-t border-slate-100 pt-5">
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700">Knowledge Base (Optional)</label>
                        <p className="text-xs text-slate-500 mt-1">Upload text files (.txt, .md, .csv) to give this agent specific context.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Upload File
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".txt,.md,.csv,.json"
                        multiple
                        className="hidden" 
                      />
                    </div>

                    {newAgentFiles.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {newAgentFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                              <span className="text-sm text-slate-700 truncate font-medium">{file.name}</span>
                              <span className="text-xs text-slate-400 shrink-0">({Math.round(file.content.length / 1024)} KB)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  form="agent-form"
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  {editingAgentId ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
