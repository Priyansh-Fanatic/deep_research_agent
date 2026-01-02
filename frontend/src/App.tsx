import { useState, useRef, useEffect } from 'react';
import { Loader2, FileText, Search, CheckCircle, Sparkles, Brain, Download, Copy, Check, Zap, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { EtheralShadow } from './components/ui/etheral-shadow';
import { TextShimmer } from './components/ui/text-shimmer';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface LogEntry {
  id: string;
  type: 'update' | 'complete' | 'error';
  message?: string;
  node?: string;
  report?: string;
  timestamp: number;
}

interface Source {
  url: string;
  title?: string;
}

function App() {
  const [topic, setTopic] = useState('');
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o-mini');
  const [isResearching, setIsResearching] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [thinkingTime, setThinkingTime] = useState(0);

  // New state for Perplexity-style UI
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isResearching) {
      interval = setInterval(() => {
        setThinkingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setThinkingTime(0);
    }
    return () => clearInterval(interval);
  }, [isResearching]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const models = [
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & Affordable' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Most Capable' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Best Reasoning' },
  ];

  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const copyToClipboard = async () => {
    if (report) {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      showNotification('Report copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadReport = async () => {
    if (report && reportRef.current) {
      try {
        showNotification('Generating PDF...');

        // Create a temporary container for the PDF
        const pdfContainer = document.createElement('div');
        pdfContainer.className = 'p-10 bg-white text-black';
        pdfContainer.style.position = 'fixed';
        pdfContainer.style.top = '0';
        pdfContainer.style.left = '0';
        pdfContainer.style.zIndex = '-9999';
        pdfContainer.style.width = '210mm'; // A4 width
        pdfContainer.style.visibility = 'visible'; // Ensure visibility for html2canvas

        // Clone the report content
        const clone = reportRef.current.cloneNode(true) as HTMLElement;

        // Process the clone to make it printer-friendly (Light Mode)

        // 1. Fix Headings
        const h1s = clone.querySelectorAll('h1');
        h1s.forEach((el: any) => {
          el.className = 'text-4xl font-bold mb-6 pb-4 border-b-2 border-gray-300 text-black';
        });

        const h2s = clone.querySelectorAll('h2');
        h2s.forEach((el: any) => {
          el.className = 'text-2xl font-bold mb-4 mt-8 text-black flex items-center gap-2';
        });

        const h3s = clone.querySelectorAll('h3');
        h3s.forEach((el: any) => {
          el.className = 'text-xl font-semibold mb-3 mt-6 text-gray-800';
        });

        // 2. Fix Text and Lists
        const textElements = clone.querySelectorAll('p, li, span, strong');
        textElements.forEach((el: any) => {
          el.classList.remove('text-gray-300', 'text-gray-400', 'text-white', 'text-cyan-500');
          el.classList.add('text-gray-900');
        });

        // 3. Fix Tables
        const tables = clone.querySelectorAll('table');
        tables.forEach((el: any) => {
          el.className = 'w-full border-collapse text-left my-6 border border-gray-300';
        });

        const theads = clone.querySelectorAll('thead');
        theads.forEach((el: any) => {
          el.className = 'bg-gray-100 text-black font-bold';
        });

        const ths = clone.querySelectorAll('th');
        ths.forEach((el: any) => {
          el.className = 'p-3 border-b-2 border-gray-300 font-bold text-black';
        });

        const tds = clone.querySelectorAll('td');
        tds.forEach((el: any) => {
          el.className = 'p-3 border-b border-gray-200 text-gray-800';
        });

        // 4. Fix Blockquotes
        const blockquotes = clone.querySelectorAll('blockquote');
        blockquotes.forEach((el: any) => {
          el.className = 'border-l-4 border-blue-500 bg-gray-50 p-4 rounded-r my-6 italic text-gray-700';
        });

        // 5. Fix Links
        const links = clone.querySelectorAll('a');
        links.forEach((el: any) => {
          el.className = 'text-blue-600 underline';
        });

        // 6. Strip all gradients and oklch colors (html2canvas doesn't support them)
        const allElements = clone.querySelectorAll('*');
        allElements.forEach((el: any) => {
          // Remove gradient backgrounds
          const bgImage = el.style.backgroundImage;
          if (bgImage && bgImage.includes('gradient')) {
            el.style.backgroundImage = 'none';
            el.style.backgroundColor = '#ffffff';
          }

          // Remove any oklch, lab, lch color functions by converting to safe colors
          const color = el.style.color;
          const bgColor = el.style.backgroundColor;
          const borderColor = el.style.borderColor;

          if (color && (color.includes('oklch') || color.includes('lab') || color.includes('lch'))) {
            el.style.color = '#000000';
          }
          if (bgColor && (bgColor.includes('oklch') || bgColor.includes('lab') || bgColor.includes('lch'))) {
            el.style.backgroundColor = '#ffffff';
          }
          if (borderColor && (borderColor.includes('oklch') || borderColor.includes('lab') || borderColor.includes('lch'))) {
            el.style.borderColor = '#cccccc';
          }

          // Remove clip-path (gradient text effects)
          if (el.style.backgroundClip === 'text' || el.style.webkitBackgroundClip === 'text') {
            el.style.backgroundClip = 'border-box';
            el.style.webkitBackgroundClip = 'border-box';
            el.style.color = '#000000';
          }
        });

        pdfContainer.appendChild(clone);
        document.body.appendChild(pdfContainer);

        const canvas = await html2canvas(pdfContainer, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true
        });

        document.body.removeChild(pdfContainer);

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`research-${topic.replace(/\s+/g, '-').toLowerCase()}.pdf`);
        showNotification('PDF downloaded successfully!');
      } catch (error) {
        console.error('PDF generation failed:', error);
        showNotification('Failed to generate PDF');
      }
    }
  };

  const startResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsResearching(true);
    setLogs([]);
    setSearchQueries([]);
    setSources([]);
    setCurrentStep('Initializing...');
    setReport(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic, model: selectedModel }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';
      let hasReceivedData = false;
      let reportReceived = false;

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          if (!hasReceivedData) {
            throw new Error('Stream ended without receiving data');
          }
          if (!reportReceived) {
            setIsResearching(false);
          }
          break;
        }

        hasReceivedData = true;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'update') {
                const message = data.message || '';

                // Parse messages for UI updates
                if (message.startsWith('Searching for:')) {
                  const query = message.replace('Searching for:', '').trim();
                  setSearchQueries(prev => [...new Set([...prev, query])]);
                  setCurrentStep('Searching...');
                } else if (message.startsWith('Scraping:')) {
                  const url = message.replace('Scraping:', '').trim();
                  setSources(prev => {
                    if (prev.some(s => s.url === url)) return prev;
                    return [...prev, { url }];
                  });
                  setCurrentStep('Reading sources...');
                } else if (message.includes('ANALYZING')) {
                  setCurrentStep('Analyzing data...');
                } else if (message.includes('SYNTHESIZING')) {
                  setCurrentStep('Synthesizing findings...');
                } else if (message.includes('WRITING')) {
                  setCurrentStep('Writing report...');
                }

                setLogs(prev => [...prev, {
                  id: Math.random().toString(36).substr(2, 9),
                  type: 'update',
                  message: data.message,
                  node: data.node,
                  timestamp: Date.now()
                }]);
              } else if (data.type === 'complete') {
                reportReceived = true;
                setReport(data.report);
                setIsResearching(false);
                showNotification('Research completed successfully!');
              } else if (data.type === 'error') {
                setLogs(prev => [...prev, {
                  id: Math.random().toString(36).substr(2, 9),
                  type: 'error',
                  message: data.message,
                  timestamp: Date.now()
                }]);
                setIsResearching(false);
                showNotification('Research encountered an error');
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line, parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Research error:', error);
      setIsResearching(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to research agent';
      showNotification(errorMessage);
      setLogs(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        type: 'error',
        message: errorMessage,
        timestamp: Date.now()
      }]);
    }
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 relative">
      {/* Animated Etheral Shadow background */}
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <EtheralShadow
          color="rgba(6, 182, 212, 0.8)"
          animation={{ scale: 80, speed: 70 }}
          noise={{ opacity: 0.5, scale: 1.2 }}
          sizing="fill"
        />
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 sm:top-6 left-4 right-4 sm:left-auto sm:right-6 z-50 bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg shadow-2xl flex items-center gap-2 max-w-sm sm:max-w-none mx-auto sm:mx-0"
          >
            <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 shrink-0" />
            <span className="text-sm sm:text-base font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-8 sm:py-12 md:py-16 max-w-5xl">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 sm:mb-12 md:mb-16 text-center"
        >
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 px-3 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-full backdrop-blur-sm">
            <Brain className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-400" />
            <span className="text-xs sm:text-sm font-medium text-cyan-300">Powered by AI Agents</span>
            <Zap className="w-3 sm:w-4 h-3 sm:h-4 text-blue-400" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4 sm:mb-6 px-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 animate-gradient">
              Deep Research Agent
            </span>
          </h1>

          <p className="text-gray-400 text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed px-4">
            Advanced autonomous research assistant that explores topics deeply using
            <span className="text-cyan-400 font-semibold"> LangGraph</span> and
            <span className="text-blue-400 font-semibold"> AI-powered analysis</span>
          </p>
        </motion.header>

        {/* Model Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4 sm:mb-6"
        >
          <label className="block text-xs sm:text-sm font-medium text-gray-400 mb-2 sm:mb-3 px-1">Select AI Model</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                disabled={isResearching}
                className={`relative p-3 sm:p-4 rounded-lg border-2 transition-all text-left ${selectedModel === model.id
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm sm:text-base font-semibold text-white">{model.name}</span>
                  {selectedModel === model.id && (
                    <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-400" />
                  )}
                </div>
                <span className="text-xs text-gray-400">{model.description}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Search Input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={startResearch}
          className="mb-8 sm:mb-12 relative"
        >
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1.5 sm:p-2 shadow-2xl">
              <Search className="w-5 sm:w-6 h-5 sm:h-6 text-gray-400 ml-2 sm:ml-4 shrink-0" />
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What would you like to research today?"
                className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 text-sm sm:text-lg px-2 sm:px-4 py-3 sm:py-4"
                disabled={isResearching}
              />
              <button
                type="submit"
                disabled={isResearching || !topic.trim()}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 sm:px-8 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-1.5 sm:gap-2 shrink-0"
              >
                {isResearching ? (
                  <>
                    <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin" />
                    <span className="hidden sm:inline">Researching...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 sm:w-5 h-4 sm:h-5" />
                    <span>Research</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.form>

        {/* Progress & Logs (Perplexity Style) */}
        <AnimatePresence>
          {isResearching && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 sm:mb-12"
            >
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 sm:p-6 backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 animate-pulse"></div>
                    <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-400 animate-spin relative z-10" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-gray-400">Working...</span>
                  <span className="text-[10px] sm:text-xs font-mono bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded text-cyan-400 border border-slate-700 ml-auto">
                    {formatTime(thinkingTime)}
                  </span>
                </div>

                {/* Current Action */}
                <div className="mb-4 sm:mb-6 pl-4 sm:pl-8">
                  <TextShimmer className="text-base sm:text-lg font-medium text-gray-200" duration={2}>
                    {currentStep}
                  </TextShimmer>
                </div>

                {/* Search Queries */}
                {searchQueries.length > 0 && (
                  <div className="mb-4 sm:mb-6 pl-4 sm:pl-8">
                    <div className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 sm:mb-3">Searching</div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {searchQueries.map((query, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/50 border border-slate-700/50 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-cyan-300/90">
                          <Search className="w-2.5 sm:w-3 h-2.5 sm:h-3 shrink-0" />
                          <span className="truncate max-w-[150px] sm:max-w-none">{query}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <div className="pl-4 sm:pl-8">
                    <button
                      onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                      className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 sm:mb-3 hover:text-gray-300 transition-colors"
                    >
                      <span>Reviewing sources</span>
                      <span className="bg-slate-800 text-gray-400 px-1.5 py-0.5 rounded text-[10px]">{sources.length}</span>
                      {isSourcesExpanded ? <ChevronUp className="w-2.5 sm:w-3 h-2.5 sm:h-3" /> : <ChevronDown className="w-2.5 sm:w-3 h-2.5 sm:h-3" />}
                    </button>

                    <AnimatePresence>
                      {isSourcesExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-hidden"
                        >
                          {sources.map((source, idx) => (
                            <div key={idx} className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg bg-slate-800/30 border border-slate-800 hover:bg-slate-800/50 transition-colors truncate">
                              <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                <Globe className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-gray-400" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs sm:text-sm text-gray-300 truncate font-medium">
                                  {source.title || new URL(source.url).hostname.replace('www.', '')}
                                </span>
                                <span className="text-[10px] sm:text-xs text-gray-500 truncate">
                                  {new URL(source.url).hostname}
                                </span>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Final Report */}
        <AnimatePresence>
          {report && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600/20 via-blue-600/20 to-teal-600/20 rounded-2xl blur" />
                <div className="relative bg-slate-900/90 backdrop-blur border border-slate-700/50 rounded-xl sm:rounded-2xl p-4 sm:p-8 md:p-14 shadow-2xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-10 pb-6 sm:pb-8 border-b border-slate-700/50">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="flex items-center justify-center w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                        <FileText className="w-5 sm:w-6 h-5 sm:h-6 text-cyan-400" />
                      </div>
                      <div>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Research Report</h2>
                        <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">Comprehensive analysis complete</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-400 hover:text-cyan-400 px-3 sm:px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700 hover:border-cyan-500/30 flex-1 sm:flex-initial"
                      >
                        {copied ? <Check className="w-3.5 sm:w-4 h-3.5 sm:h-4" /> : <Copy className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
                        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={downloadReport}
                        className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-400 hover:text-blue-400 px-3 sm:px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700 hover:border-blue-500/30 flex-1 sm:flex-initial"
                      >
                        <Download className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        <span className="hidden sm:inline">PDF</span>
                      </button>
                      <button
                        onClick={() => {
                          setReport(null);
                          setLogs([]);
                          setTopic('');
                        }}
                        className="hidden sm:flex items-center gap-2 text-xs sm:text-sm text-gray-400 hover:text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700"
                      >
                        New Research
                      </button>
                    </div>
                  </div>

                  <div ref={reportRef} className="max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-4 sm:mb-8 mt-6 sm:mt-10 pb-3 sm:pb-4 border-b border-slate-700" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-4 sm:mb-6 mt-6 sm:mt-10 flex items-center gap-2 sm:gap-3" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="text-lg sm:text-xl font-semibold text-cyan-300 mb-3 sm:mb-4 mt-4 sm:mt-6" {...props} />,
                        p: ({ node, ...props }) => <p className="text-gray-300 leading-relaxed mb-4 sm:mb-6 text-sm sm:text-base md:text-lg" {...props} />,
                        ul: ({ node, ...props }) => <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 ml-3 sm:ml-4" {...props} />,
                        ol: ({ node, ...props }) => <ol className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 ml-3 sm:ml-4 list-decimal text-gray-300" {...props} />,
                        li: ({ node, ...props }) => (
                          <li className="flex items-start gap-2 sm:gap-3 text-gray-300 text-sm sm:text-base">
                            <span className="text-cyan-500 mt-1 sm:mt-1.5 font-bold">•</span>
                            <span className="flex-1" {...props} />
                          </li>
                        ),
                        blockquote: ({ node, ...props }) => (
                          <blockquote className="border-l-4 border-cyan-500 bg-slate-800/50 p-3 sm:p-6 rounded-r-lg my-4 sm:my-8 italic text-gray-300 text-sm sm:text-base shadow-lg" {...props} />
                        ),
                        table: ({ node, ...props }) => (
                          <div className="my-4 sm:my-8 overflow-x-auto rounded-xl border border-slate-700 shadow-2xl bg-slate-900/50 -mx-4 sm:mx-0">
                            <table className="w-full border-collapse text-left min-w-[500px]" {...props} />
                          </div>
                        ),
                        thead: ({ node, ...props }) => <thead className="bg-slate-800/80 text-cyan-300" {...props} />,
                        tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-700/50" {...props} />,
                        tr: ({ node, ...props }) => <tr className="hover:bg-slate-800/30 transition-colors" {...props} />,
                        th: ({ node, ...props }) => <th className="p-3 sm:p-5 font-bold text-xs sm:text-sm uppercase tracking-wider border-b border-slate-600 whitespace-nowrap" {...props} />,
                        td: ({ node, ...props }) => <td className="p-3 sm:p-5 text-gray-300 text-xs sm:text-base border-b border-slate-700/50" {...props} />,
                        strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                        a: ({ node, ...props }) => <a className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-500/30 underline-offset-4 transition-colors" {...props} />,
                      }}
                    >
                      {report}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          )
          }
        </AnimatePresence >

        {/* Footer */}
        {
          !report && !isResearching && logs.length === 0 && (
            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-20 text-center text-gray-500 text-sm"
            >
              <p>Built with React, FastAPI, LangGraph & OpenRouter</p>
              <p className="mt-2">Advanced AI-powered research at your fingertips</p>
            </motion.footer>
          )
        }
      </div >
    </div >
  );
}

export default App;
