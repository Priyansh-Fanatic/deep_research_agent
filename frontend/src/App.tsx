import { useState, useRef, useEffect } from 'react';
import { Loader2, FileText, Search, CheckCircle, Sparkles, Brain, Download, Copy, Check, Zap, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [isResearching, setIsResearching] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [thinkingTime, setThinkingTime] = useState(0);

  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isResearching) {
      interval = setInterval(() => setThinkingTime((prev) => prev + 1), 1000);
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
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Groq · Fast & Free · Best Default' },
    { id: 'gemini-2.5-flash',        name: 'Gemini 2.5 Flash', description: 'Google · Speed & Context' },
    { id: 'openai/gpt-4o-mini',      name: 'GPT-4o Mini', description: 'OpenRouter · Great Analysis' },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', description: 'OpenRouter · Deep Reasoning · Free' },
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
        showNotification('Generating PDF…');
        const pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = 'padding:40px;background:#fff;color:#000;position:fixed;top:0;left:0;z-index:-9999;width:210mm;';

        const clone = reportRef.current.cloneNode(true) as HTMLElement;

        // Strip dark-mode colours for PDF
        clone.querySelectorAll('*').forEach((el: any) => {
          const s = el.style;
          if (s.backgroundImage?.includes('gradient')) { s.backgroundImage = 'none'; s.backgroundColor = '#fff'; }
          if (s.color?.includes('oklch'))          s.color = '#000';
          if (s.backgroundColor?.includes('oklch')) s.backgroundColor = '#fff';
          if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') {
            s.backgroundClip = 'border-box'; s.webkitBackgroundClip = 'border-box'; s.color = '#000';
          }
        });

        pdfContainer.appendChild(clone);
        document.body.appendChild(pdfContainer);

        const canvas = await html2canvas(pdfContainer, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
        document.body.removeChild(pdfContainer);

        const imgW = 210, pageH = 297;
        const imgH = (canvas.height * imgW) / canvas.width;
        let heightLeft = imgH, position = 0;

        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
        while (heightLeft >= 0) {
          position = heightLeft - imgH;
          pdf.addPage();
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgW, imgH);
          heightLeft -= pageH;
        }

        pdf.save(`research-${topic.replace(/\s+/g, '-').toLowerCase()}.pdf`);
        showNotification('PDF downloaded!');
      } catch (err) {
        console.error(err);
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
    setCurrentStep('Initializing…');
    setReport(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, model: selectedModel }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} — ${text}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream available');

      let buffer = '';
      let hasData = false;
      let reportReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (!hasData) throw new Error('Stream ended without receiving data');
          if (!reportReceived) setIsResearching(false);
          break;
        }

        hasData = true;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'update') {
              const msg = data.message || '';
              if (msg.startsWith('Searching for:')) {
                setSearchQueries(prev => [...new Set([...prev, msg.replace('Searching for:', '').trim()])]);
                setCurrentStep('Searching the web…');
              } else if (msg.startsWith('Scraping:')) {
                const url = msg.replace('Scraping:', '').trim();
                setSources(prev => prev.some(s => s.url === url) ? prev : [...prev, { url }]);
                setCurrentStep('Reading sources…');
              } else if (msg.includes('ANALYZING'))   setCurrentStep('Analyzing data…');
              else if (msg.includes('SYNTHESIZING'))   setCurrentStep('Synthesizing findings…');
              else if (msg.includes('WRITING'))        setCurrentStep('Writing report…');

              setLogs(prev => [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                type: 'update', message: data.message, node: data.node, timestamp: Date.now()
              }]);
            } else if (data.type === 'complete') {
              reportReceived = true;
              setReport(data.report);
              setIsResearching(false);
              showNotification('Research completed!');
            } else if (data.type === 'error') {
              setLogs(prev => [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                type: 'error', message: data.message, timestamp: Date.now()
              }]);
              setIsResearching(false);
              showNotification('Research encountered an error');
            }
          } catch (parseErr) {
            console.warn('Failed to parse SSE:', line, parseErr);
          }
        }
      }
    } catch (error) {
      console.error(error);
      setIsResearching(false);
      const msg = error instanceof Error ? error.message : 'Failed to connect to research agent';
      showNotification(msg);
      setLogs(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        type: 'error', message: msg, timestamp: Date.now()
      }]);
    }
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 relative overflow-x-hidden font-sans selection:bg-white selection:text-zinc-900">

      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 sm:top-6 right-4 sm:right-6 z-50 flex items-center gap-2.5 bg-white text-zinc-900 px-5 py-3 rounded-lg shadow-2xl border border-zinc-200 max-w-sm"
          >
            <CheckCircle className="w-4 h-4 shrink-0 text-zinc-900" />
            <span className="text-sm font-semibold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 container mx-auto px-4 py-10 sm:py-14 md:py-20 max-w-5xl">

        {/* ── Header ── */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 sm:mb-14 text-center"
        >
          <div className="inline-flex items-center gap-2 mb-5 px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-semibold text-zinc-400 tracking-widest uppercase">
            <Brain className="w-3.5 h-3.5 text-zinc-400" />
            <span>Deep AI Agent Research</span>
            <Zap className="w-3 h-3 text-zinc-600" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-4 text-white leading-tight">
            Deep Research Agent
          </h1>

          <p className="text-zinc-500 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed px-4">
            Autonomous research assistant powered by{' '}
            <span className="text-zinc-300 font-semibold">LangGraph</span> with{' '}
            <span className="text-zinc-300 font-semibold">multi-provider AI fallbacks</span>
          </p>
        </motion.header>

        {/* ── Model Selection ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 sm:mb-8"
        >
          <label className="block text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">
            Select AI Intelligence
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {models.map((model) => {
              const isActive = selectedModel === model.id;
              return (
                <button
                  key={model.id}
                  id={`model-${model.id}`}
                  onClick={() => setSelectedModel(model.id)}
                  disabled={isResearching}
                  className={`relative p-4 rounded-lg text-left transition-all duration-200 group bw-card ${
                    isActive ? 'bw-card-active' : ''
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-bold transition-colors ${isActive ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                      {model.name}
                    </span>
                    {isActive
                      ? <CheckCircle className="w-4 h-4 text-white shrink-0" />
                      : <div className="w-4 h-4 rounded-full border border-zinc-700 group-hover:border-zinc-500 transition-colors" />
                    }
                  </div>
                  <span className={`text-[11px] leading-relaxed block ${isActive ? 'text-zinc-400' : 'text-zinc-600 group-hover:text-zinc-500'}`}>
                    {model.description}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ── Search Input ── */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={startResearch}
          className="mb-8 sm:mb-12"
        >
          <div className="relative flex items-center bg-[#111113] border border-zinc-800 rounded-lg p-2 focus-within:border-white focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.05)] transition-all duration-200">
            <Search className="w-5 h-5 text-zinc-600 ml-2 sm:ml-3 shrink-0 transition-colors focus-within:text-white" />
            <input
              id="research-topic-input"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What would you like to research today?"
              className="w-full bg-transparent border-none text-zinc-100 placeholder-zinc-600 focus:ring-0 text-sm sm:text-base px-3 py-3 focus:outline-none"
              disabled={isResearching}
            />
            <button
              id="research-submit-btn"
              type="submit"
              disabled={isResearching || !topic.trim()}
              className="btn-bw-primary px-5 sm:px-8 py-3 text-sm sm:text-sm font-semibold flex items-center gap-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed rounded-md"
            >
              {isResearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Researching…</span>
                  <span className="sm:hidden">…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Research</span>
                </>
              )}
            </button>
          </div>
        </motion.form>

        {/* ── Research Stream ── */}
        <AnimatePresence>
          {isResearching && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 sm:mb-12"
            >
              <div className="bg-[#111113] border border-zinc-800 rounded-lg p-5 sm:p-7">
                {/* Header row */}
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-zinc-800">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
                    Research Stream Active
                  </span>
                  <span className="ml-auto text-[11px] font-mono bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded text-zinc-400">
                    {formatTime(thinkingTime)}
                  </span>
                </div>

                {/* Current step */}
                <div className="mb-6">
                  <TextShimmer className="text-lg sm:text-2xl font-bold text-white tracking-tight" duration={1.8}>
                    {currentStep}
                  </TextShimmer>
                </div>

                {/* Search queries */}
                {searchQueries.length > 0 && (
                  <div className="mb-6">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">
                      Search Queries
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchQueries.map((q, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-[11px] text-zinc-400"
                        >
                          <Search className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="truncate max-w-[160px] sm:max-w-xs">{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <div>
                    <button
                      onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                      className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 hover:text-zinc-400 transition-colors focus:outline-none"
                    >
                      <span>Reviewed Sources</span>
                      <span className="bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-0.5 rounded text-[10px] font-mono">
                        {sources.length}
                      </span>
                      {isSourcesExpanded
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                      }
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
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all truncate group"
                            >
                              <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                <Globe className="w-3.5 h-3.5 text-zinc-500" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs text-zinc-300 truncate font-medium group-hover:text-white transition-colors">
                                  {source.title || (() => { try { return new URL(source.url).hostname.replace('www.', ''); } catch { return source.url; } })()}
                                </span>
                                <span className="text-[10px] text-zinc-600 truncate">
                                  {(() => { try { return new URL(source.url).hostname; } catch { return source.url; } })()}
                                </span>
                              </div>
                            </a>
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

        {/* ── Final Report ── */}
        <AnimatePresence>
          {report && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* ── Report toolbar ── */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800">
                    <FileText className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">Research Report</h2>
                      <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">COMPLETE</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-0.5">{topic}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    id="copy-report-btn"
                    onClick={copyToClipboard}
                    className="btn-bw-secondary flex items-center justify-center gap-1.5 text-xs px-3.5 py-2 flex-1 sm:flex-initial font-medium rounded-md"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    id="download-pdf-btn"
                    onClick={downloadReport}
                    className="btn-bw-secondary flex items-center justify-center gap-1.5 text-xs px-3.5 py-2 flex-1 sm:flex-initial font-medium rounded-md"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>PDF</span>
                  </button>
                  <button
                    id="new-research-btn"
                    onClick={() => { setReport(null); setLogs([]); setTopic(''); setSources([]); setSearchQueries([]); }}
                    className="btn-bw-primary flex items-center justify-center gap-1.5 text-xs px-4 py-2 hidden sm:flex font-semibold rounded-md"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    New Research
                  </button>
                </div>
              </div>

              {/* ── Report document ── */}
              <div className="flex gap-8 items-start">

                {/* Sidebar — visible on large screens */}
                <aside className="hidden lg:block w-52 shrink-0 sticky top-8">
                  <div className="bg-[#111113] border border-zinc-800 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">In this report</p>
                    <div className="space-y-1">
                      {['Overview', 'Key Statistics', 'Market Landscape', 'Analysis', 'Future Outlook', 'Conclusion', 'References'].map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 group cursor-default">
                          <span className="text-[10px] font-mono text-zinc-700 w-4">{String(i + 1).padStart(2, '0')}</span>
                          <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">{s}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <p className="text-[10px] text-zinc-700 mb-1 font-medium">Sources found</p>
                      <p className="text-lg font-bold text-zinc-300">{sources.length}</p>
                    </div>
                    <div className="mt-3">
                      <p className="text-[10px] text-zinc-700 mb-1 font-medium">Research time</p>
                      <p className="text-lg font-bold text-zinc-300">{formatTime(thinkingTime)}</p>
                    </div>
                  </div>
                </aside>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div ref={reportRef} className="report-prose lg:columns-2 gap-8 [column-fill:auto]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // H1 — document title spans all columns
                        h1: ({ node, ...props }) => (
                          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-6 mt-0 tracking-tight leading-tight [column-span:all] border-b border-zinc-800 pb-4 break-inside-avoid" {...props} />
                        ),
                        // H2 — major sections with left accent bar
                        h2: ({ node, children, ...props }) => (
                          <h2
                            className="flex items-center gap-3 text-base sm:text-lg font-bold text-white mt-10 mb-4 pb-3 border-b border-zinc-800 break-inside-avoid"
                            {...props}
                          >
                            <span className="inline-block w-1 h-5 bg-white rounded-full shrink-0" />
                            {children}
                          </h2>
                        ),
                        // H3 — subsections
                        h3: ({ node, ...props }) => (
                          <h3 className="text-sm sm:text-base font-semibold text-zinc-200 mt-6 mb-3 break-inside-avoid" {...props} />
                        ),
                        // Paragraphs
                        p: ({ node, ...props }) => (
                          <p className="text-zinc-400 leading-7 mb-4 text-sm sm:text-base break-inside-avoid" {...props} />
                        ),
                        // Unordered lists
                        ul: ({ node, ...props }) => (
                          <ul className="my-4 space-y-2 pl-0 break-inside-avoid" {...props} />
                        ),
                        // Ordered lists
                        ol: ({ node, ...props }) => (
                          <ol className="my-4 space-y-2 pl-5 list-decimal marker:text-zinc-600 break-inside-avoid" {...props} />
                        ),
                        // List items
                        li: ({ node, children, ordered, ...props }: any) => (
                          <li className="relative pl-5 text-zinc-400 text-sm leading-7" {...props}>
                            <span className="absolute left-0 top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-700" />
                            {children}
                          </li>
                        ),
                        // Blockquote — styled callout box
                        blockquote: ({ node, ...props }) => (
                          <blockquote
                            className="relative my-6 pl-5 pr-4 py-4 border-l-2 border-zinc-600 bg-zinc-900/60 rounded-r-lg text-zinc-400 italic text-sm leading-7 break-inside-avoid"
                            {...props}
                          />
                        ),
                        // Tables
                        table: ({ node, ...props }) => (
                          <div className="my-6 overflow-x-auto rounded-xl border border-zinc-800 shadow-lg shadow-black/20 break-inside-avoid">
                            <table className="w-full border-collapse text-left text-sm" {...props} />
                          </div>
                        ),
                        thead: ({ node, ...props }) => (
                          <thead className="bg-zinc-900" {...props} />
                        ),
                        tbody: ({ node, ...props }) => (
                          <tbody className="divide-y divide-zinc-800/60" {...props} />
                        ),
                        tr: ({ node, ...props }) => (
                          <tr className="hover:bg-zinc-900/40 transition-colors" {...props} />
                        ),
                        th: ({ node, ...props }) => (
                          <th
                            className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-800 whitespace-nowrap"
                            {...props}
                          />
                        ),
                        td: ({ node, ...props }) => (
                          <td className="px-4 py-3 text-zinc-400 text-sm" {...props} />
                        ),
                        // Bold
                        strong: ({ node, ...props }) => (
                          <strong className="font-semibold text-zinc-200" {...props} />
                        ),
                        // Links
                        a: ({ node, ...props }) => (
                          <a
                            className="text-zinc-300 underline underline-offset-3 decoration-zinc-700 hover:text-white hover:decoration-zinc-400 transition-colors"
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                          />
                        ),
                        // Inline code
                        code: ({ node, inline, ...props }: any) =>
                          inline ? (
                            <code
                              className="font-mono text-[0.8em] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700"
                              {...props}
                            />
                          ) : (
                            <code className="block font-mono text-sm text-zinc-300" {...props} />
                          ),
                        // Code block
                        pre: ({ node, ...props }) => (
                          <pre
                            className="my-5 p-4 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto text-sm font-mono text-zinc-300 leading-relaxed"
                            {...props}
                          />
                        ),
                        // Horizontal rule — section divider
                        hr: () => (
                          <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                        ),
                      }}
                    >
                      {report}
                    </ReactMarkdown>
                  </div>

                  {/* Mobile: new research button */}
                  <div className="mt-8 pt-6 border-t border-zinc-800 flex sm:hidden">
                    <button
                      onClick={() => { setReport(null); setLogs([]); setTopic(''); setSources([]); setSearchQueries([]); }}
                      className="btn-bw-primary flex items-center gap-2 text-sm px-6 py-3 font-semibold rounded-md w-full justify-center"
                    >
                      <Sparkles className="w-4 h-4" />
                      Start New Research
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ── */}
        {!report && !isResearching && logs.length === 0 && (
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-24 text-center text-zinc-700 text-xs tracking-wider"
          >
            <p>Built with React · FastAPI · LangGraph · Groq · OpenRouter</p>
            <p className="mt-1.5 text-zinc-800">Advanced AI-powered research at your fingertips</p>
          </motion.footer>
        )}

      </div>
    </div>
  );
}

export default App;
