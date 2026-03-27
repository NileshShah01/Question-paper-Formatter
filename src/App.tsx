import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Printer, 
  FileText, 
  PlusCircle, 
  Image as ImageIcon,
  AlertCircle,
  Upload,
  Loader2,
  Sparkles,
  X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type QuestionType = 'normal' | 'fill_blanks' | 'mcq' | 'short_answer';

interface MCQOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: MCQOption[];
  image?: string;
}

interface Section {
  id: string;
  title: string;
  marks: number;
  questions: Question[];
}

interface HeaderInfo {
  schoolName: string;
  schoolSubName: string;
  examName: string;
  examTerm: string;
  examSession: string;
  date: string;
  time: string;
  className: string;
  subject: string;
  fullMarks: number;
  logo?: string;
}

type LayoutType = 'single' | 'dual';

export default function App() {
  const [layout, setLayout] = useState<LayoutType>('single');
  const toRoman = (num: number) => {
    const lookup: { [key: string]: number } = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '', i;
    for (i in lookup) {
      while (num >= lookup[i]) {
        roman += i;
        num -= lookup[i];
      }
    }
    return roman;
  };
  const [header, setHeader] = useState<HeaderInfo>({
    schoolName: 'APEX PUBLIC SCHOOL',
    schoolSubName: 'ANJANI BAZAR',
    examName: '2nd TERMINAL EXAMINATION',
    examTerm: 'NOV',
    examSession: '2025-26',
    date: '03/12/2025',
    time: '3hrs.',
    className: '3rd',
    subject: 'G.K',
    fullMarks: 40
  });

  const [sections, setSections] = useState<Section[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [handwrittenImages, setHandwrittenImages] = useState<string[]>([]);

  const [totalMarks, setTotalMarks] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const total = sections.reduce((acc, section) => acc + (Number(section.marks) || 0), 0);
    setTotalMarks(total);
  }, [sections]);

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setHeader(prev => ({ ...prev, [name]: name === 'fullMarks' ? Number(value) : value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setHeader(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const [extractionStatus, setExtractionStatus] = useState<string>('');

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        resolve(base64Str); // Fallback to original if compression fails
      };
    });
  };

  const handleHandwrittenUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    setIsExtracting(true);
    setExtractionStatus('Compressing images...');
    
    try {
      for (const file of files) {
        const reader = new FileReader();
        const compressed = await new Promise<string>((resolve) => {
          reader.onloadend = async () => {
            const res = await compressImage(reader.result as string);
            resolve(res);
          };
          reader.readAsDataURL(file);
        });
        setHandwrittenImages(prev => [...prev, compressed]);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsExtracting(false);
      setExtractionStatus('');
    }
  };

  const cleanQuestionText = (text: string) => {
    // Remove leading numbers like "1.", "Q1.", "1)", "(1)", "1. ", etc.
    return text.replace(/^(Q\d+[\.\:\-\s]*|\d+[\.\:\-\s]*|\(\d+\)[\.\:\-\s]*|[a-z]\)[\.\:\-\s]*|\([a-z]\)[\.\:\-\s]*)\s*/i, '').trim();
  };

  const saveDraft = () => {
    const data = {
      header,
      sections,
      layout,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ExamCraft_${header.subject || 'Draft'}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadDraft = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.header) setHeader(data.header);
        if (data.sections) setSections(data.sections);
        if (data.layout) setLayout(data.layout);
      } catch (err) {
        alert('Invalid draft file');
      }
    };
    reader.readAsText(file);
  };

  const extractQuestions = async () => {
    if (handwrittenImages.length === 0) return;
    
    setIsExtracting(true);
    setExtractionStatus(`Starting analysis of ${handwrittenImages.length} images...`);
    
    const statusInterval = setInterval(() => {
      const statuses = [
        'Reading handwriting...',
        'Identifying question types...',
        'Organizing sections...',
        'Almost there...',
        'Finalizing layout...'
      ];
      setExtractionStatus(prev => {
        const currentIndex = statuses.indexOf(prev);
        return statuses[(currentIndex + 1) % statuses.length];
      });
    }, 3000);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('MISSING_API_KEY');
      }

      const ai = new GoogleGenerativeAI(apiKey);
  const model = "gemini-1.5-flash"; 
      
      // Process in chunks of 3 for better reliability and progress tracking
      const CHUNK_SIZE = 3;
      let allExtractedSections: any[] = [];
      
      for (let i = 0; i < handwrittenImages.length; i += CHUNK_SIZE) {
        const chunk = handwrittenImages.slice(i, i + CHUNK_SIZE);
        setExtractionStatus(`Analyzing image batch ${Math.floor(i/CHUNK_SIZE) + 1} of ${Math.ceil(handwrittenImages.length/CHUNK_SIZE)}...`);
        
        const imageParts = chunk.map(img => ({
          inlineData: {
            data: img.split(',')[1],
            mimeType: "image/jpeg"
          }
        }));

        const modelInstance = ai.getGenerativeModel(
          { model: "models/gemini-1.5-flash" }
        );
        
        const result = await modelInstance.generateContent([
          ...imageParts,
          `Extract questions from these images. Rules: Group into sections, capture exact wording, NO question numbers in 'text'. Types: 'mcq', 'fill_blanks', 'short_answer', 'normal'. Return ONLY a JSON array of sections. Follow this schema: [{title: string, marks: number, questions: [{type: string, text: string, options: [{text: string}]}]}]`
        ]);

        const responseText = result.response.text();
        const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
        const extractedChunk = JSON.parse(cleanedText);
        allExtractedSections = [...allExtractedSections, ...extractedChunk];
      }

      const newSections = allExtractedSections.map((s: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: s.title || 'Untitled Section',
        marks: s.marks || 0,
        questions: (s.questions || []).map((q: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          type: q.type || 'normal',
          text: cleanQuestionText(q.text || ''),
          options: q.options?.map((o: any, i: number) => ({ id: Math.random().toString(36).substr(2, 9), text: o.text || '' })) || (q.type === 'mcq' ? [{ id: '1', text: '' }, { id: '2', text: '' }, { id: '3', text: '' }, { id: '4', text: '' }] : [])
        }))
      }));

      setSections(prev => [...prev, ...newSections]);
    } catch (error: any) {
      console.error("Extraction error:", error);
      if (error.message === 'AI_TIMEOUT') {
        alert("Extraction is taking too long. Please try uploading fewer images or ensure they are clear.");
      } else if (error.message === 'MISSING_API_KEY') {
        alert("Gemini API Key is missing. Please configure it in the AI Studio Secrets panel.");
      } else {
        alert(`Extraction failed: ${error.message || 'Unknown error'}. Please try again with clearer photos.`);
      }
    } finally {
      clearInterval(statusInterval);
      setIsExtracting(false);
      setExtractionStatus('');
    }
  };

  const addSection = () => {
    const newSection: Section = {
      id: Date.now().toString(),
      title: 'New Section',
      marks: 0,
      questions: [{ id: Date.now().toString() + 'q', type: 'normal', text: '' }]
    };
    setSections([...sections, newSection]);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };

  const updateSection = (id: string, field: keyof Section, value: any) => {
    setSections(sections.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addQuestion = (sectionId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: [
            ...s.questions,
            { 
              id: Date.now().toString(), 
              type: 'normal', 
              text: '', 
              options: [] 
            }
          ]
        };
      }
      return s;
    }));
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: s.questions.filter(q => q.id !== questionId)
        };
      }
      return s;
    }));
  };

  const updateQuestion = (sectionId: string, questionId: string, field: keyof Question, value: any) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: s.questions.map(q => q.id === questionId ? { ...q, [field]: value } : q)
        };
      }
      return s;
    }));
  };

  const handleImageUpload = (sectionId: string, questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateQuestion(sectionId, questionId, 'image', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (error) {
      console.error("Print failed:", error);
      alert("Print failed. Please try opening the app in a new tab.");
    }
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current || isDownloading) return;
    
    setIsDownloading(true);
    try {
      const element = previewRef.current;
      const opt = {
        margin: 0,
        filename: `${header.schoolName.replace(/\s+/g, '_')}_${header.subject}_Exam.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          letterRendering: true
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF Download failed:", error);
      alert("PDF Download failed. You can try using the 'Print' button and 'Save as PDF' instead.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadWord = () => {
    if (!previewRef.current) return;
    
    try {
      const headerHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>Question Paper</title>
          <style>
            body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.2; }
            .exam-paper { width: 100%; border: none; }
            .exam-school-name { text-align: center; font-size: 24pt; font-weight: bold; text-decoration: underline; text-transform: uppercase; }
            .exam-header-row { display: table; width: 100%; font-size: 12pt; border-bottom: 1pt solid black; margin-bottom: 10pt; }
            .exam-header-item { display: table-cell; }
            .exam-header-item.center { text-align: center; }
            .exam-header-item.right { text-align: right; }
            .section-header { font-weight: bold; margin-top: 15pt; }
            .question-item { margin-top: 5pt; }
          </style>
        </head>
        <body>
      `;
      const footerHtml = "</body></html>";
      
      const source = headerHtml + previewRef.current.innerHTML + footerHtml;
      const fileContents = '<html>\n' + source + '\n</html>';
      
      const blob = new Blob(['\ufeff', source], {
        type: 'application/msword'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${header.schoolName.replace(/\s+/g, '_')}_${header.subject}_Exam.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Word Download failed:", error);
      alert("Word download failed.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-50">
      {/* Left Panel: Input Form */}
      <div className="w-full lg:w-1/2 p-6 bg-white border-r border-zinc-200 overflow-y-auto no-print">
        <div className="max-w-2xl mx-auto space-y-8">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-transparent">ExamCraft AI</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Handwritten to Professional Format</p>
              </div>
            </div>
          </header>

          {/* AI Upload Section */}
          <section className="bg-gradient-to-br from-zinc-900 via-indigo-950 to-zinc-900 text-white p-6 rounded-3xl shadow-2xl space-y-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all" />
            
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-400/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">AI Smart Extraction</h2>
              <span className="ml-auto text-[10px] bg-indigo-500/40 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-indigo-400/30">Pro Feature</span>
            </div>
            <p className="text-zinc-400 text-xs leading-relaxed">Turn handwritten notes into professional papers. Upload photos for instant AI transcription.</p>
            
            <div className="flex gap-4">
              <label className="flex-1 flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-zinc-700 rounded-xl hover:border-zinc-500 transition-colors cursor-pointer bg-zinc-800/50">
                <Upload className="w-6 h-6 text-zinc-400" />
                <span className="text-xs font-medium">Upload Photos</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleHandwrittenUpload} />
              </label>
              
              {handwrittenImages.length > 0 && (
                <button 
                  onClick={() => setHandwrittenImages([])}
                  disabled={isExtracting}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-800/50 text-zinc-400 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-6 h-6" />
                  <span className="text-xs">Clear All</span>
                </button>
              )}
              
              <button 
                onClick={extractQuestions}
                disabled={isExtracting || handwrittenImages.length === 0}
                className="flex-[2] flex flex-col items-center justify-center gap-2 p-4 bg-amber-500 text-zinc-900 rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold min-w-[140px]"
              >
                {isExtracting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                <span className="text-xs">{isExtracting ? extractionStatus : 'Extract with AI'}</span>
              </button>
            </div>

            {handwrittenImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2">
                {handwrittenImages.map((img, i) => (
                  <div key={i} className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                    <img src={img} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setHandwrittenImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Header Info Section */}
          <section className="space-y-4 bg-zinc-50 p-6 rounded-2xl border border-zinc-200">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              General Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">School Name</label>
                  <input 
                    type="text" name="schoolName" value={header.schoolName} onChange={handleHeaderChange}
                    className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="shrink-0">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Logo</label>
                  <label className="flex items-center justify-center w-12 h-12 rounded-xl border-2 border-dashed border-zinc-300 hover:border-zinc-900 transition-colors cursor-pointer overflow-hidden">
                    {header.logo ? <img src={header.logo} className="w-full h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-zinc-400" />}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Sub Title (Address)</label>
                <input 
                  type="text" name="schoolSubName" value={header.schoolSubName} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. ANJANI BAZAR"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Exam Session</label>
                <input 
                  type="text" name="examSession" value={header.examSession} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. 2025-26"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Exam Name</label>
                <input 
                  type="text" name="examName" value={header.examName} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Exam Term</label>
                <input 
                  type="text" name="examTerm" value={header.examTerm} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Date</label>
                <input 
                  type="text" name="date" value={header.date} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Time</label>
                <input 
                  type="text" name="time" value={header.time} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Class</label>
                <input 
                  type="text" name="className" value={header.className} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Subject</label>
                <input 
                  type="text" name="subject" value={header.subject} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Full Marks</label>
                <input 
                  type="number" name="fullMarks" value={header.fullMarks} onChange={handleHeaderChange}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </section>

          {/* Section Builder */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <PlusCircle className="w-5 h-5" />
                Question Sections
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex p-1 bg-zinc-100 rounded-lg mr-2">
                  <button 
                    onClick={() => setLayout('single')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                      layout === 'single' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    Single
                  </button>
                  <button 
                    onClick={() => setLayout('dual')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                      layout === 'dual' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    Dual
                  </button>
                </div>
                <button 
                  onClick={addSection}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" /> Add Section
                </button>
              </div>
            </div>

            {sections.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-zinc-200 rounded-3xl bg-zinc-50 text-center space-y-4">
                <div className="p-4 bg-white rounded-2xl shadow-sm border border-zinc-100">
                  <PlusCircle className="w-8 h-8 text-zinc-300" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">No sections yet</h3>
                  <p className="text-sm text-zinc-500 max-w-[240px] mx-auto leading-relaxed">Starting from scratch? Add a section manually or use AI extraction.</p>
                </div>
                <button 
                  onClick={addSection}
                  className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all font-semibold shadow-md active:scale-95"
                >
                  Create First Section
                </button>
              </div>
            )}

            {sections.map((section, sIdx) => (
              <div key={section.id} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group/section">
                <div className="bg-zinc-50 p-4 border-bottom border-zinc-200 flex items-center justify-between gap-4">
                  <div className="flex-1 flex gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Section Title</label>
                      <input 
                        type="text" value={section.title} onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                        className="w-full bg-transparent border-b border-zinc-300 focus:border-zinc-900 outline-none py-1 font-medium"
                        placeholder="e.g. Write Using Roman Numerals"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Marks</label>
                      <input 
                        type="number" value={section.marks} onChange={(e) => updateSection(section.id, 'marks', Number(e.target.value))}
                        className="w-full bg-transparent border-b border-zinc-300 focus:border-zinc-900 outline-none py-1 font-medium"
                      />
                    </div>
                  </div>
                  <button onClick={() => removeSection(section.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {section.questions.map((question, qIdx) => (
                    <div key={question.id} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-2 text-xs font-bold text-zinc-400">{qIdx + 1}.</span>
                        <div className="flex-1 space-y-3">
                          <div className="flex gap-2">
                            <select 
                              value={question.type} 
                              onChange={(e) => updateQuestion(section.id, question.id, 'type', e.target.value as QuestionType)}
                              className="text-xs font-bold uppercase tracking-wider bg-white border border-zinc-200 rounded-lg px-2 py-1 outline-none"
                            >
                              <option value="normal">Normal</option>
                              <option value="fill_blanks">Fill in Blanks</option>
                              <option value="mcq">MCQ</option>
                              <option value="short_answer">Short Answer</option>
                            </select>
                            <button 
                              onClick={() => document.getElementById(`img-upload-${question.id}`)?.click()}
                              className="p-1 text-zinc-500 hover:text-zinc-900 transition-colors"
                              title="Add Image"
                            >
                              <ImageIcon className="w-4 h-4" />
                            </button>
                            <input 
                              id={`img-upload-${question.id}`}
                              type="file" accept="image/*" className="hidden"
                              onChange={(e) => handleImageUpload(section.id, question.id, e)}
                            />
                          </div>
                          
                          <textarea 
                            value={question.text} 
                            onChange={(e) => updateQuestion(section.id, question.id, 'text', e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all min-h-[80px]"
                            placeholder="Type question here..."
                          />

                          {question.type === 'mcq' && (
                            <div className="space-y-2 pl-4 border-l-2 border-zinc-200">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase text-zinc-400">Options</p>
                                <button 
                                  onClick={() => {
                                    const newOptions = [...(question.options || []), { id: Date.now().toString(), text: '' }];
                                    updateQuestion(section.id, question.id, 'options', newOptions);
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase"
                                >
                                  + Add Option
                                </button>
                              </div>
                              {question.options?.map((opt, optIdx) => (
                                <div key={opt.id} className="flex items-center gap-2 group">
                                  <div className="w-4 h-4 border border-zinc-300 rounded shrink-0" />
                                  <input 
                                    type="text"
                                    placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                    className="flex-1 text-sm bg-transparent border-b border-zinc-200 focus:border-zinc-900 outline-none py-1"
                                    value={opt.text}
                                    onChange={(e) => {
                                      const newOptions = [...(question.options || [])];
                                      newOptions[optIdx] = { ...newOptions[optIdx], text: e.target.value };
                                      updateQuestion(section.id, question.id, 'options', newOptions);
                                    }}
                                  />
                                  <button 
                                    onClick={() => {
                                      const newOptions = question.options?.filter((_, i) => i !== optIdx);
                                      updateQuestion(section.id, question.id, 'options', newOptions);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-opacity"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {(!question.options || question.options.length === 0) && (
                                <p className="text-xs text-zinc-400 italic">No options added. Click '+ Add Option' to start.</p>
                              )}
                            </div>
                          )}

                          {question.image && (
                            <div className="relative group w-32 h-32 rounded-lg overflow-hidden border border-zinc-200">
                              <img src={question.image} alt="Question" className="w-full h-full object-cover" />
                              <button 
                                onClick={() => updateQuestion(section.id, question.id, 'image', undefined)}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeQuestion(section.id, question.id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => addQuestion(section.id)}
                    className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2 text-sm font-bold active:scale-[0.99]"
                  >
                    <Plus className="w-4 h-4" /> Add Question
                  </button>
                </div>
              </div>
            ))}

            {sections.length > 0 && (
              <div className="flex justify-center pt-4">
                <button 
                  onClick={addSection}
                  className="flex items-center gap-2 px-8 py-3 bg-zinc-100 text-zinc-600 rounded-2xl hover:bg-zinc-200 hover:text-zinc-900 transition-all font-bold text-sm"
                >
                  <PlusCircle className="w-5 h-5" /> New Section
                </button>
              </div>
            )}
          </section>

          {/* Validation Warning */}
          {totalMarks !== header.fullMarks && sections.length > 0 && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">
                Total marks ({totalMarks}) do not match Full Marks ({header.fullMarks}).
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 pt-6 border-t border-zinc-200">
            <button 
              onClick={saveDraft}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 transition-colors font-semibold shadow-sm"
            >
              <Download className="w-5 h-5" /> Save Draft
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 transition-colors font-semibold shadow-sm cursor-pointer">
              <Upload className="w-5 h-5" /> Load Draft
              <input type="file" accept=".json" className="hidden" onChange={loadDraft} />
            </label>
          </div>
          
          <div className="flex flex-wrap gap-4 pt-4 pb-12">
            <button 
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors font-semibold shadow-lg"
            >
              <Printer className="w-5 h-5" /> Print Paper
            </button>
            <button 
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-zinc-900 text-zinc-900 rounded-xl hover:bg-zinc-50 transition-colors font-semibold disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              {isDownloading ? 'Generating PDF...' : 'Download PDF'}
            </button>
            <button 
              onClick={handleDownloadWord}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-zinc-900 text-zinc-900 rounded-xl hover:bg-zinc-50 transition-colors font-semibold"
            >
              <FileText className="w-5 h-5" />
              Download Word
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Live Preview */}
      <div className="w-full lg:w-1/2 bg-zinc-100 p-8 overflow-y-auto flex justify-center items-start min-h-screen">
        <div id="exam-paper-preview" ref={previewRef} className="exam-paper shadow-2xl">
          {/* School Name & Logo */}
          <div className="exam-header-main">
            <div className="exam-logo-container">
              {header.logo && <img src={header.logo} alt="Logo" className="exam-logo w-[60px] h-[60px] object-contain" />}
            </div>
            <div className="exam-school-name underline">
              {header.schoolName}
            </div>
            <div className="exam-school-sub">
              ({header.schoolSubName})
            </div>
          </div>

          {/* Header Row 1: Time, Exam Name, Date */}
          <div className="exam-header-row">
            <div className="exam-header-item font-bold">Time:{header.time}</div>
            <div className="exam-header-item center font-bold underline px-2">
              {header.examName} - {header.examSession}<br/>
              ({header.examTerm})
            </div>
            <div className="exam-header-item right font-bold">DATE:-{header.date}</div>
          </div>

          {/* Header Row 2: Class, Subject, Full Marks */}
          <div className="exam-header-row last">
            <div className="exam-header-item font-bold">CLASS – {header.className}</div>
            <div className="exam-header-item center font-bold">SUB – {header.subject}</div>
            <div className="exam-header-item right font-bold">FULL MARKS-{header.fullMarks}</div>
          </div>

          {/* Sections and Questions */}
          <div className={cn(
            "space-y-4",
            layout === 'dual' && "columns-2 gap-8 space-y-0"
          )}>
            {sections.map((section, sIdx) => (
              <div key={section.id} className="section-container">
                <div className="section-header">
                  <span>{toRoman(sIdx + 1)}. {section.title} ({section.marks} Marks)</span>
                </div>
                <div className="question-list">
                  {section.questions.map((question, qIdx) => (
                    <div key={question.id} className="question-item">
                      <span className="question-label">{qIdx + 1}.</span>
                      <div className="question-content space-y-2">
                        <div className="whitespace-pre-wrap">
                          {question.type === 'fill_blanks' ? (
                            question.text.split('___').map((part, i, arr) => (
                              <React.Fragment key={i}>
                                {part}
                                {i < arr.length - 1 && <span className="inline-block mx-1" style={{ borderBottom: '1px solid #000', width: '60px' }} />}
                              </React.Fragment>
                            ))
                          ) : (
                            question.text
                          )}
                        </div>

                        {question.image && (
                          <div className="my-2" style={{ maxWidth: '100%' }}>
                            <img src={question.image} alt="Question Diagram" style={{ maxWidth: '100%', height: 'auto', border: '1px solid #000' }} />
                          </div>
                        )}

                        {question.type === 'mcq' && question.options && (
                          <div className="mcq-container-inline">
                            {question.options.map((opt, i) => (
                              <div key={i} className="mcq-option">
                                <span>({String.fromCharCode(97 + i)}) {opt.text}</span>
                                <div className="checkbox-square" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer / End of Paper */}
          {sections.length > 0 && (
            <div className="mt-20 text-center italic" style={{ borderTop: '1px solid #000', paddingTop: '16px' }}>
              *** End of Question Paper ***
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
