import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import html2canvas from 'html2canvas';
import {
  Activity,
  Download,
  Play,
  Table as TableIcon,
  Settings,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Filter,
  Search,
  Upload,
  Image,
  FileSpreadsheet,
  RefreshCcw,
  Sliders,
  Database,
  Layers,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

const FILE_ID = "1TF2LJiUB_Db2Srb-PF-oM1tWwLzN0T6P";
const DOWNLOAD_URL = `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=xlsx`;

export default function App() {
  // Section 1: Configuration & Dataset (Persistent)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('terminology_api_key') || "");
  const [fileName, setFileName] = useState(() => localStorage.getItem('terminology_file_name') || "");
  const [data, setData] = useState([]);

  // Section 2: Fixed & Variable Parameter Control
  const [range, setRange] = useState({ from: 1, to: 10 });
  const [variableParam, setVariableParam] = useState('prompt'); // 'prompt', 'model', or 'temperature'

  const [fixedModel, setFixedModel] = useState("meta-llama/Meta-Llama-3.1-70B-Instruct");
  const [fixedTemp, setFixedTemp] = useState(0);
  const [fixedPrompt, setFixedPrompt] = useState("Extract all terminology items from the sentence. Return ONLY the result in the format [term1, term2, ...].");

  // Section 3: Values for the Variable Parameter
  const [varA, setVarA] = useState("");
  const [varB, setVarB] = useState("");
  const [varC, setVarC] = useState("");

  // System State
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle');
  const [search, setSearch] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [dataSource, setDataSource] = useState('none'); // 'local', 'cloud', 'none'
  const timerRef = useRef(null);

  const tableRef = useRef(null);
  const metricsRef = useRef(null);

  // Default initial variable values
  useEffect(() => {
    if (variableParam === 'prompt' && !varA) {
      setVarA("You are an expert in terminology extraction. Extract all key terminology items. Return ONLY [term1, term2, ...].");
      setVarB("Extract terminology terms from the sentence. Respond strictly as a list in square brackets: [term1, term2...]");
      setVarC("Identify and list all terminology entities. Format: [entity1, entity2]. No explanations.");
    } else if (variableParam === 'model' && !varA) {
      setVarA("meta-llama/Meta-Llama-3.1-70B-Instruct");
      setVarB("meta-llama/Meta-Llama-3.1-8B-Instruct");
      setVarC("mistralai/Mistral-7B-Instruct-v0.3");
    } else if (variableParam === 'temperature' && !varA) {
      setVarA("0");
      setVarB("0.5");
      setVarC("1.0");
    }
  }, [variableParam]);

  // Persistent Storage Sync
  useEffect(() => {
    localStorage.setItem('terminology_api_key', apiKey);
    localStorage.setItem('terminology_file_name', fileName);
  }, [apiKey, fileName]);

  const resetAll = () => {
    if (confirm("Reset everything? Current data and settings will be cleared.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const processLoadedData = (jsonData) => {
    const processed = jsonData.map((row, idx) => {
      let sentenceId = row.sentence_id || row['Sentence ID'] || row['id'] || '';
      let sentence = row.sentence || row['Sentence'] || '';
      let annotations = row.annotations || row['Annotations'] || row['term'] || row['Human annotated terms'] || '';

      if (!sentence) {
        const keys = Object.keys(row);
        const sentKey = keys.find(k => k.toLowerCase().includes('sentence') && !k.toLowerCase().includes('id'));
        if (sentKey) sentence = row[sentKey];
        const idKey = keys.find(k => k.toLowerCase().includes('id') && k.toLowerCase().includes('sentence'));
        if (idKey) sentenceId = row[idKey];
        const annoKey = keys.find(k => k.toLowerCase().includes('annotation') || k.toLowerCase().includes('term'));
        if (annoKey) annotations = row[annoKey];
      }

      return {
        id: idx,
        sentence_id: sentenceId,
        sentence: sentence,
        annotations: annotations,
        Result_A: '',
        Result_B: '',
        Result_C: '',
      };
    }).filter(r => r.sentence);

    setData(processed);
  };

  const loadDataset = async () => {
    try {
      setLoading(true); setStatus('loading');
      const response = await fetch(DOWNLOAD_URL);
      const arrayBuffer = await response.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      processLoadedData(jsonData);
      setFileName("terminology_sample_v1.xlsx");
      setDataSource('cloud');
      setStatus('Success: Demo Data Loaded');
    } catch (error) {
      alert("Failed to load dataset from Cloud. Check CORS or your network.");
      setStatus('Error');
    } finally { setLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      setFileName(file.name);
      setDataSource('local');
      processLoadedData(jsonData);
      setStatus(`Success: ${file.name} Uploaded`);
      setLoading(false);
      e.target.value = "";
    };
    reader.onerror = () => { setLoading(false); alert("File read error"); };
    reader.readAsBinaryString(file);
  };

  const startInference = async () => {
    if (!apiKey) return alert("Please enter API Key");

    setProcessing(true);
    setStatus('running');
    setProgress(0);
    setElapsedTime(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.studio.nebius.ai/v1/",
      dangerouslyAllowBrowser: true
    });

    const startIndex = Math.max(0, range.from - 1);
    const endIndex = Math.min(data.length, range.to);
    const subset = data.slice(startIndex, endIndex);

    for (let i = 0; i < subset.length; i++) {
      const row = subset[i];
      const targetId = row.id;

      try {
        const variants = [
          { key: 'Result_A', val: varA },
          { key: 'Result_B', val: varB },
          { key: 'Result_C', val: varC }
        ];

        await Promise.all(variants.map(async (v) => {
          // Resolve parameters based on what is variable
          const currentModel = variableParam === 'model' ? v.val : fixedModel;
          const currentTemp = parseFloat(variableParam === 'temperature' ? v.val : fixedTemp);
          const currentPrompt = variableParam === 'prompt' ? v.val : fixedPrompt;

          try {
            const completion = await client.chat.completions.create({
              model: currentModel,
              messages: [
                { role: "system", content: currentPrompt },
                { role: "user", content: row.sentence }
              ],
              temperature: currentTemp,
            });
            const result = completion.choices[0].message.content.trim();
            setData(prev => prev.map(r => r.id === targetId ? { ...r, [v.key]: result } : r));
          } catch (e) {
            setData(prev => prev.map(r => r.id === targetId ? { ...r, [v.key]: `Error: ${e.message}` } : r));
          }
        }));

        setProgress(Math.round(((i + 1) / subset.length) * 100));
      } catch (err) {
        console.error("Row error:", err);
      }
    }
    clearInterval(timerRef.current);
    setProcessing(false); setStatus('done');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getLabel = (suffix) => {
    const val = suffix === 'A' ? varA : suffix === 'B' ? varB : varC;
    if (variableParam === 'prompt') return `Prompt ${suffix}`;
    if (variableParam === 'temperature') return `Temp: ${val}`;
    if (variableParam === 'model') return val.split('/').pop();
    return `Option ${suffix}`;
  };

  const exportToExcel = () => {
    const startIndex = Math.max(0, range.from - 1);
    const endIndex = range.to;
    const subset = data.slice(startIndex, endIndex);

    const exportData = subset.map(r => ({
      "ID": r.sentence_id,
      "Sentence": r.sentence,
      "Human Annotated": parseTerms(r.annotations).join(', '),
      [`(${getLabel('A')}) Result`]: parseTerms(r.Result_A).join(', '),
      [`(${getLabel('B')}) Result`]: parseTerms(r.Result_B).join(', '),
      [`(${getLabel('C')}) Result`]: parseTerms(r.Result_C).join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scaled_Results");
    XLSX.writeFile(wb, `terminology_varying_${variableParam}_rows_${range.from}_to_${range.to}.xlsx`);
  };

  const exportToImage = async (ref, name) => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        onclone: (clonedDoc) => {
          // Hide UI elements during export for a cleaner look
          const buttons = clonedDoc.querySelectorAll('button');
          buttons.forEach(b => b.style.display = 'none');

          const headlines = clonedDoc.querySelectorAll('h3');
          headlines.forEach(h => {
            if (h.innerText.includes('Scaling Analysis')) {
              h.style.display = 'none';
            }
          });

          const container = clonedDoc.querySelector('.metrics-table-container');
          if (container) {
            container.style.marginTop = '0';
            container.style.padding = '40px';
          }
        }
      });
      const link = document.createElement('a');
      link.download = `terminology_varying_${variableParam}_${name}_rows_${range.from}_to_${range.to}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  const metrics = getEvaluationMetrics(data, range, variableParam, varA, varB, varC);
  const bestMetric = [...metrics].sort((a, b) => b.f1 - a.f1)[0];

  const filteredData = data.filter(r =>
    r.sentence.toLowerCase().includes(search.toLowerCase()) ||
    (r.Result_A && r.Result_A.toLowerCase().includes(search.toLowerCase())) ||
    (r.annotations && r.annotations.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="title-area">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={32} color="#3b82f6" />
            <h1>Terminology AI Benchmarker</h1>
          </div>
          <p>Terminology work with AI support — LLM-based term extraction</p>
          <button
            className="btn-primary"
            onClick={resetAll}
            style={{
              marginTop: '12px',
              background: '#fef2f2',
              color: '#ef4444',
              border: '1px solid #fee2e2',
              padding: '6px 14px',
              fontSize: '0.75rem',
              boxShadow: 'none'
            }}
          >
            <RefreshCcw size={14} /> Global System Reset
          </button>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span className={`status-badge status-${status.toLowerCase().includes('success') ? 'done' : (status === 'done' ? 'done' : (status === 'running' ? 'running' : 'idle'))}`}>
            {status === 'running' && <Activity size={14} className="pulsing" style={{ marginRight: '6px' }} />}
            {status}
          </span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px' }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Filter results..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', padding: '8px', outline: 'none', fontSize: '0.85rem', width: '180px' }}
            />
          </div>
          <button className="btn-primary" onClick={() => exportToImage(tableRef, 'explorer')} style={{ padding: '8px 16px' }} disabled={data.length === 0}>
            <Image size={18} /> Export View
          </button>
          <button className="btn-primary" onClick={exportToExcel} style={{ padding: '8px 16px' }} disabled={data.length === 0}>
            <Download size={18} /> Export Excel
          </button>
        </div>
      </header>

      <main className="grid-layout">
        <aside className="sidebar">
          {/* Section 1: Data Setup */}
          <section className="card glass">
            <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} color="#2563eb" /> 1. Configuration
            </h3>
            <div className="input-group">
              <label>API Key</label>
              <input type="password" className="input-field" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your Nebius API Key" />
            </div>
            <div className="input-group">
              <label>Data Source</label>
              <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', marginBottom: '12px' }}>
                <button
                  onClick={() => setDataSource('local')}
                  style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: dataSource === 'local' || dataSource === 'none' ? '#fff' : 'transparent', color: dataSource === 'local' || dataSource === 'none' ? '#2563eb' : '#64748b', boxShadow: dataSource === 'local' || dataSource === 'none' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  Your File
                </button>
                <button
                  onClick={loadDataset}
                  style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: dataSource === 'cloud' ? '#fff' : 'transparent', color: dataSource === 'cloud' ? '#7c3aed' : '#64748b', boxShadow: dataSource === 'cloud' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  Demo Library
                </button>
              </div>
            </div>

            {(dataSource === 'local' || dataSource === 'none') && (
              <div className="input-group">
                <input type="file" accept=".xlsx, .xls" id="f-up" style={{ display: 'none' }} onChange={handleFileUpload} />
                <label htmlFor="f-up" className="input-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '8px', height: '100px', border: '2px dashed #cbd5e1', background: '#f8fafc', color: '#64748b' }}>
                  {loading ? <Activity className="pulsing" /> : (
                    <>
                      <Upload size={24} color="#3b82f6" />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{fileName || "Click to Upload Excel"}</div>
                        <div style={{ fontSize: '0.7rem' }}>Supported: .xlsx, .xls</div>
                      </div>
                    </>
                  )}
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn-primary" style={{ flex: 1, background: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2', boxShadow: 'none' }} onClick={resetAll}>
                <RefreshCcw size={16} /> Reset Everything
              </button>
            </div>

            {data.length > 0 && (
              <div style={{ marginTop: '16px', padding: '12px', background: dataSource === 'cloud' ? '#f5f3ff' : '#eff6ff', borderRadius: '10px', border: `1px solid ${dataSource === 'cloud' ? '#ddd6fe' : '#dbeafe'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: dataSource === 'cloud' ? '#7c3aed' : '#2563eb', fontSize: '0.70rem', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {dataSource === 'cloud' ? <><Database size={14} /> ACTIVE: DEMO LIBRARY</> : <><FileSpreadsheet size={14} /> ACTIVE: YOUR PROJECT DATA</>}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 700, wordBreak: 'break-all', marginBottom: '4px', lineHeight: 1.4 }}>{fileName}</div>
                <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div> {data.length.toLocaleString()} terminology rows ready
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Fixed Parameters */}
          <section className="card glass">
            <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} color="#7c3aed" /> 2. Parameters Fix
            </h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>From</label>
                <input type="number" className="input-field" style={{ padding: '8px' }} value={range.from} onChange={e => setRange({ ...range, from: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>To</label>
                <input type="number" className="input-field" style={{ padding: '8px' }} value={range.to} onChange={e => setRange({ ...range, to: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="input-group">
              <label>What parameter to VARY?</label>
              <select className="input-field" value={variableParam} onChange={e => { setVariableParam(e.target.value); setVarA(""); setVarB(""); setVarC(""); }}>
                <option value="prompt">Prompt (A, B, C)</option>
                <option value="model">Model Name (A, B, C)</option>
                <option value="temperature">Temperature (A, B, C)</option>
              </select>
            </div>

            <div className="input-group" style={{ opacity: variableParam === 'model' ? 0.4 : 1 }}>
              <label>Fixed Model</label>
              <input type="text" className="input-field" value={fixedModel} disabled={variableParam === 'model'} onChange={e => setFixedModel(e.target.value)} />
            </div>
            <div className="input-group" style={{ opacity: variableParam === 'temperature' ? 0.4 : 1 }}>
              <label>Fixed Temp</label>
              <input type="number" step="0.1" className="input-field" value={fixedTemp} disabled={variableParam === 'temperature'} onChange={e => setFixedTemp(e.target.value)} />
            </div>
            <div className="input-group" style={{ opacity: variableParam === 'prompt' ? 0.4 : 1 }}>
              <label>Fixed Prompt</label>
              <textarea className="input-field" style={{ height: '60px', fontSize: '0.8rem' }} value={fixedPrompt} disabled={variableParam === 'prompt'} onChange={e => setFixedPrompt(e.target.value)} />
            </div>
          </section>

          {/* Section 3: Variable Inputs */}
          <section className="card glass">
            <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} color="#f59e0b" /> 3. Var: {variableParam}
            </h3>
            <div className="input-group">
              <label>Option A</label>
              {variableParam === 'prompt' ? <textarea className="input-field" value={varA} onChange={e => setVarA(e.target.value)} /> : <input type="text" className="input-field" value={varA} onChange={e => setVarA(e.target.value)} />}
            </div>
            <div className="input-group">
              <label>Option B</label>
              {variableParam === 'prompt' ? <textarea className="input-field" value={varB} onChange={e => setVarB(e.target.value)} /> : <input type="text" className="input-field" value={varB} onChange={e => setVarB(e.target.value)} />}
            </div>
            <div className="input-group">
              <label>Option C</label>
              {variableParam === 'prompt' ? <textarea className="input-field" value={varC} onChange={e => setVarC(e.target.value)} /> : <input type="text" className="input-field" value={varC} onChange={e => setVarC(e.target.value)} />}
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={startInference} disabled={data.length === 0 || processing}>
              {processing ? "Processing..." : <><Play size={18} /> Execute Run</>}
            </button>
            {(processing || (status === 'done' && elapsedTime > 0)) && (
              <div style={{ marginTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: status === 'done' ? '#059669' : '#64748b' }}>
                    {status === 'done' ? 'Run Complete' : `${progress}% Processing`}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                    {formatTime(elapsedTime)}
                  </span>
                </div>
                <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${progress}%`, background: status === 'done' ? '#10b981' : undefined }}></div></div>
              </div>
            )}
          </section>
        </aside>

        <section className="card glass" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '15px' }}>
            <h3><Layers size={20} /> Result Matrix</h3>
          </div>
          <div className="table-container" ref={tableRef}>
            <table>
              <thead>
                <tr>
                  <th>Sentence</th>
                  <th>Truth</th>
                  <th>{getLabel('A')}</th>
                  <th>{getLabel('B')}</th>
                  <th>{getLabel('C')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(range.from - 1, range.to).map(row => (
                  <tr key={row.id}>
                    <td className="sentence-cell">{row.sentence}</td>
                    <td>{renderTerms(row.annotations, true)}</td>
                    <td className="result-cell">{row.Result_A ? renderTerms(row.Result_A) : (processing && data.indexOf(row) >= (range.from - 1) && data.indexOf(row) < range.to ? <span className="pulsing" style={{ color: '#60a5fa' }}>Thinking...</span> : null)}</td>
                    <td className="result-cell">{row.Result_B ? renderTerms(row.Result_B) : (processing && data.indexOf(row) >= (range.from - 1) && data.indexOf(row) < range.to ? <span className="pulsing" style={{ color: '#60a5fa' }}>Thinking...</span> : null)}</td>
                    <td className="result-cell">{row.Result_C ? renderTerms(row.Result_C) : (processing && data.indexOf(row) >= (range.from - 1) && data.indexOf(row) < range.to ? <span className="pulsing" style={{ color: '#60a5fa' }}>Thinking...</span> : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="metrics-table-container" ref={metricsRef} style={{ background: '#fafafa', padding: '30px', borderRadius: '16px', marginTop: '40px' }}>
            <div className="metrics-table-header" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}><Zap size={20} /> Scaling Analysis Dashboard</h3>
                <button className="btn-primary" onClick={() => exportToImage(metricsRef, 'eval')}>
                  <Image size={16} /> Save Eval View
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <p style={{ fontSize: '0.85rem', color: '#1e293b', marginBottom: variableParam !== 'prompt' ? '12px' : '0', display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                  <span><strong>Varying:</strong> <span style={{ color: '#2563eb' }}>{variableParam.toUpperCase()}</span></span>
                  {variableParam !== 'model' && <span><strong>Fixed Model:</strong> {fixedModel}</span>}
                  {variableParam !== 'temperature' && <span><strong>Fixed Temp:</strong> {fixedTemp}</span>}
                  <span><strong>Rows:</strong> {range.from} - {range.to}</span>
                </p>
                {variableParam !== 'prompt' ? (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                    <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fixed System Prompt</p>
                    <p style={{ fontSize: '0.85rem', color: '#475569', fontStyle: 'italic', lineHeight: '1.5', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      "{fixedPrompt}"
                    </p>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: '6px', textTransform: 'uppercase' }}>Prompt A</p>
                      <p style={{ fontSize: '0.8rem', color: '#475569', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #dbeafe', minHeight: '60px' }}>"{varA}"</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', marginBottom: '6px', textTransform: 'uppercase' }}>Prompt B</p>
                      <p style={{ fontSize: '0.8rem', color: '#475569', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5', minHeight: '60px' }}>"{varB}"</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8b5cf6', marginBottom: '6px', textTransform: 'uppercase' }}>Prompt C</p>
                      <p style={{ fontSize: '0.8rem', color: '#475569', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ede9fe', minHeight: '60px' }}>"{varC}"</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="metrics-flex-layout">
              <div className="metrics-table-side">
                <table>
                  <thead><tr><th>Variation</th><th>Prec.</th><th>Rec.</th><th>F1</th></tr></thead>
                  <tbody>
                    {metrics.map(m => (
                      <tr key={m.key}>
                        <td>{m.label}</td>
                        <td><span className={`score-badge ${m.precision > 0.8 ? 'score-high' : 'score-low'}`}>{(m.precision * 100).toFixed(0)}%</span></td>
                        <td><span className={`score-badge ${m.recall > 0.8 ? 'score-high' : 'score-low'}`}>{(m.recall * 100).toFixed(0)}%</span></td>
                        <td><span className={`score-badge ${(m.f1 === bestMetric?.f1 && m.f1 > 0) ? 'score-high' : 'score-low'}`}>{(m.f1 * 100).toFixed(0)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bestMetric && (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#ecfdf5', borderRadius: '10px', border: '1px solid #10b981' }}>
                    <p style={{ color: '#047857', fontWeight: 700, fontSize: '0.85rem' }}>🎯 Recommendation</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#064e3b' }}>Best Performance: {bestMetric.label}</p>
                    <p style={{ fontSize: '0.75rem', color: '#047857' }}>This configuration yielded the highest balanced extraction quality (F1: {(bestMetric.f1 * 100).toFixed(1)}%).</p>
                  </div>
                )}
              </div>
              <div className="chart-side">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="shortLabel" axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 1]} tickFormatter={v => `${v * 100}%`} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(label, items) => items[0]?.payload?.label || label}
                      formatter={v => `${(v * 100).toFixed(1)}%`}
                    />
                    <Legend />
                    <Bar dataKey="precision" name="Precision" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="recall" name="Recall" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="f1" name="F1-Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function getEvaluationMetrics(data, range, variableParam, varA, varB, varC) {
  const subset = data.slice(Math.max(0, range.from - 1), range.to);
  const getLabel = (suffix) => {
    const val = suffix === 'A' ? varA : suffix === 'B' ? varB : varC;
    if (variableParam === 'prompt') return `Prompt ${suffix}`;
    if (variableParam === 'temperature') return `Temp: ${val}`;
    if (variableParam === 'model') return `Model ${suffix}: ${val.split('/').pop()}`;
    return `Option ${suffix}`;
  };

  return ['A', 'B', 'C'].map(suffix => {
    let tp = 0; let fp = 0; let fn = 0;
    subset.forEach(row => {
      const truth = new Set(parseTerms(row.annotations).map(t => t.toLowerCase()));
      const predicted = new Set(parseTerms(row[`Result_${suffix}`]).map(t => t.toLowerCase()));
      predicted.forEach(term => { if (truth.has(term)) tp++; else fp++; });
      truth.forEach(term => { if (!predicted.has(term)) fn++; });
    });
    const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
    const recall = (tp + fn) === 0 ? 0 : tp / (tp + fn);
    const f1 = (precision + recall) === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    const val = suffix === 'A' ? varA : suffix === 'B' ? varB : varC;
    const shortLabel = variableParam === 'model' ? `Model ${suffix}` :
      variableParam === 'temperature' ? `${val}` :
        `Prompt ${suffix}`;
    return { key: suffix, label: getLabel(suffix), shortLabel, precision, recall, f1 };
  });
}

function parseTerms(text) {
  if (!text || text === 'nan') return [];
  try {
    const listStr = text.match(/\[(.*?)\]/);
    if (listStr) return listStr[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(t => t && t !== 'nan');
    if (text.includes(',')) return text.split(',').map(t => t.trim()).filter(t => t && t !== 'nan');
    return [text.trim()].filter(t => t && t !== 'nan');
  } catch (e) { return [text].filter(t => t && t !== 'nan'); }
}

function renderTerms(text, isHuman = false) {
  const terms = parseTerms(text);
  if (terms.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {terms.map((term, i) => <span key={i} className={`term-tag ${isHuman ? 'term-tag-human' : ''}`}>{term}</span>)}
    </div>
  );
}
