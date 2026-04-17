import React, { useState, useRef, useCallback } from 'react';
import './App.css';

const API_KEY = process.env.REACT_APP_ANTHROPIC_KEY;

function App() {
  const [foto, setFoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rapport, setRapport] = useState('');
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [spraakActief, setSpaakActief] = useState(false);
  const [cameraActief, setCameraActief] = useState(false);
  const [chatGeschiedenis, setChatGeschiedenis] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [fase, setFase] = useState('upload');
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  const verwerkBestand = (bestand) => {
    if (!bestand) return;
    setFoto(bestand);
    setPreview(URL.createObjectURL(bestand));
    setRapport(''); setFout(''); setChatGeschiedenis([]); setFase('upload');
  };
  const handleUpload = (e) => verwerkBestand(e.target.files[0]);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const b = e.dataTransfer.files[0];
    if (b && b.type.startsWith('image/')) verwerkBestand(b);
  }, []);

  const startCamera = async () => {
    try {
      setCameraActief(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      mediaStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch (err) { setFout('Camera: ' + err.message); setCameraActief(false); }
  };
  const maakFoto = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(function(blob) { verwerkBestand(new File([blob], 'foto.jpg', { type: 'image/jpeg' })); stopCamera(); }, 'image/jpeg', 0.95);
  };
  const stopCamera = () => {
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(function(t) { t.stop(); }); mediaStreamRef.current = null; }
    setCameraActief(false);
  };

  const startSpaak = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setFout('Spraakherkenning niet beschikbaar.'); return; }
    const r = new SR();
    r.lang = 'nl-NL'; r.continuous = false; r.interimResults = false;
    r.onstart = function() { setSpaakActief(true); };
    r.onresult = function(e) { const t = e.results[0][0].transcript; setChatInput(function(p) { return p + (p ? ' ' : '') + t; }); };
    r.onend = function() { setSpaakActief(false); };
    r.onerror = function() { setSpaakActief(false); };
    recognitionRef.current = r; r.start();
  };
  const stopSpaak = () => { if (recognitionRef.current) recognitionRef.current.stop(); setSpaakActief(false); };

  const toBase64 = (f) => new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = function(e) { res(e.target.result.split(',')[1]); };
    rd.onerror = rej; rd.readAsDataURL(f);
  });

  const callAPI = async (content, maxT) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: maxT, messages: [{ role: 'user', content: content }] })
    });
    if (!resp.ok) throw new Error(await resp.text());
    return (await resp.json()).content[0].text;
  };

  const analyseer = async () => {
    if (!foto) return;
    setLaden(true); setFout(''); setRapport('');
    try {
      const b64 = await toBase64(foto);
      const vraag = chatInput || 'Analyseer dit gebouw professioneel.';
      const tekst = await callAPI([
        { type: 'image', source: { type: 'base64', media_type: foto.type || 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Je bent expert gebouwinspecteur. Professioneel rapport in Nederlands. Secties: ## Gebouwtype ## Staat ## Gebreken ## Positief ## Aanbevelingen ## Score (1-10). Vraag: ' + vraag }
      ], 2000);
      setRapport(tekst);
      setChatGeschiedenis([{ rol: 'inspecteur', tekst: vraag }, { rol: 'ai', tekst: tekst }]);
      setFase('chat');
    } catch (e) { setFout('Fout: ' + e.message); }
    setLaden(false);
  };

  const stuurChat = async () => {
    if (!chatInput.trim() || !foto) return;
    const vraag = chatInput.trim(); setChatInput('');
    const hist = [...chatGeschiedenis, { rol: 'inspecteur', tekst: vraag }];
    setChatGeschiedenis(hist); setLaden(true);
    try {
      const b64 = await toBase64(foto);
      const tekst = await callAPI([
        { type: 'image', source: { type: 'base64', media_type: foto.type || 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Expert gebouwinspecteur. Vorig rapport: ' + rapport + ' Vraag: ' + vraag }
      ], 1000);
      setChatGeschiedenis([...hist, { rol: 'ai', tekst: tekst }]);
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { setFout('Fout: ' + e.message); }
    setLaden(false);
  };

  const reset = () => { setFoto(null); setPreview(null); setRapport(''); setFout(''); setChatGeschiedenis([]); setChatInput(''); setFase('upload'); stopCamera(); };
  const md = (t) => t.replace(/## ([^
]*)/g, '<h3>$1</h3>').replace(/
/g, '<br/>');

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          <div className="logo-icon">GI</div>
          <div><h1>GebouwInspectie Pro</h1><span className="header-sub">AI-gedreven analyse</span></div>
        </div>
        <div className="header-rechts">
          <span className="badge-ai">Claude 3.5 Sonnet</span>
          {foto && <button className="btn-reset" onClick={reset}>Nieuwe inspectie</button>}
        </div>
      </header>
      <main className="main">
        {cameraActief && (
          <div className="camera-modal">
            <div className="camera-container">
              <div className="camera-header"><span>Camera</span><button className="btn-sluit" onClick={stopCamera}>X</button></div>
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="camera-knoppen"><button className="btn-foto-maken" onClick={maakFoto}><span className="shutter"></span></button></div>
            </div>
          </div>
        )}
        {fase === 'upload' && !foto && (
          <div className="upload-sectie">
            <div className="upload-titel"><h2>Start nieuwe inspectie</h2><p>Upload een foto of maak een opname</p></div>
            <div className="dropzone" onDrop={handleDrop} onDragOver={function(e){e.preventDefault();}} onClick={function(){if(fileInputRef.current)fileInputRef.current.click();}}>
              <div className="dropzone-inhoud">
                <div className="dropzone-icoon">📁</div>
                <p className="dropzone-titel">Sleep een foto hierheen</p>
                <p className="dropzone-sub">of klik om te kiezen</p>
              </div>
            </div>
            <div className="of-divider"><span>of</span></div>
            <button className="btn-camera-groot" onClick={startCamera}>📷 Open camera</button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{display:'none'}} />
          </div>
        )}
        {foto && fase === 'upload' && (
          <div className="analyse-sectie">
            <div className="foto-panel">
              <div className="foto-header">
                <span className="foto-label">Geselecteerde foto</span>
                <button className="btn-wissel" onClick={function(){if(fileInputRef.current)fileInputRef.current.click();}}>Andere foto</button>
                <button className="btn-wissel" onClick={startCamera}>Camera</button>
              </div>
              <img src={preview} alt="Gebouw" className="foto-preview" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{display:'none'}} />
            </div>
            <div className="vraag-panel">
              <h3>Specifieke vraag (optioneel)</h3>
              <div className="spraak-invoer">
                <textarea className="spraak-tekstvak" placeholder="Bijv: Let op de fundering..." value={chatInput} onChange={function(e){setChatInput(e.target.value);}} rows={3} />
                <button className={spraakActief ? 'btn-spraak actief' : 'btn-spraak'} onMouseDown={startSpaak} onMouseUp={stopSpaak} onTouchStart={startSpaak} onTouchEnd={stopSpaak}>
                  {spraakActief ? '🔴' : '🎙️'}
                </button>
              </div>
              {spraakActief && <p className="spraak-status">Luisteren...</p>}
              {fout && <div className="fout-melding">{fout}</div>}
              <button className="btn-analyseer" onClick={analyseer} disabled={laden}>{laden ? 'Analyseren...' : '🔍 Analyseer gebouw'}</button>
            </div>
          </div>
        )}
        {fase === 'chat' && (
          <div className="rapport-sectie">
            <div className="rapport-links">
              <img src={preview} alt="Gebouw" className="foto-klein" />
              <button className="btn-wissel-klein" onClick={function(){setFase('upload');}}>Terug</button>
            </div>
            <div className="rapport-rechts">
              <div className="chat-berichten">
                {chatGeschiedenis.map(function(b,i){
                  return (
                    <div key={i} className={b.rol === 'ai' ? 'chat-bericht ai' : 'chat-bericht inspecteur'}>
                      <div className="bericht-avatar">{b.rol === 'ai' ? '🏗️' : '👤'}</div>
                      <div className="bericht-inhoud">
                        <span className="bericht-naam">{b.rol === 'ai' ? 'GebouwAI' : 'Inspecteur'}</span>
                        <div className="bericht-tekst" dangerouslySetInnerHTML={{__html: md(b.tekst)}} />
                      </div>
                    </div>
                  );
                })}
                {laden && (
                  <div className="chat-bericht ai">
                    <div className="bericht-avatar">🏗️</div>
                    <div className="bericht-inhoud">
                      <span className="bericht-naam">GebouwAI</span>
                      <div className="typing-indicator"><span></span><span></span><span></span></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-invoer-balk">
                <div className="chat-invoer-wrapper">
                  <textarea className="chat-tekstvak" placeholder="Stel een vervolgvraag..." value={chatInput} onChange={function(e){setChatInput(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();stuurChat();}}} rows={2} />
                  <div className="chat-invoer-knoppen">
                    <button className={spraakActief ? 'btn-spraak-chat actief' : 'btn-spraak-chat'} onMouseDown={startSpaak} onMouseUp={stopSpaak} onTouchStart={startSpaak} onTouchEnd={stopSpaak}>{spraakActief ? '🔴' : '🎙️'}</button>
                    <button className="btn-verstuur" onClick={stuurChat} disabled={laden || !chatInput.trim()}>{laden ? '...' : '➤'}</button>
                  </div>
                </div>
                {spraakActief && <p className="spraak-status">Luisteren...</p>}
                {fout && <div className="fout-melding">{fout}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
