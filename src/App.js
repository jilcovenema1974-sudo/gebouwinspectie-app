import React, { useState, useRef, useCallback } from 'react';
import './App.css';

const API_KEY = process.env.REACT_APP_ANTHROPIC_KEY;

function App() {
  const [foto, setFoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rapport, setRapport] = useState('');
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [spraakTekst, setSpaakTekst] = useState('');
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
    setRapport('');
    setFout('');
    setSpaakTekst('');
    setChatGeschiedenis([]);
    setFase('upload');
  };

  const handleUpload = (e) => verwerkBestand(e.target.files[0]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const bestand = e.dataTransfer.files[0];
    if (bestand && bestand.type.startsWith('image/')) verwerkBestand(bestand);
  }, []);

  const startCamera = async () => {
    try {
      setCameraActief(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setFout('Camera niet beschikbaar: ' + err.message);
      setCameraActief(false);
    }
  };

  const maakFoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const bestand = new File([blob], 'camera-foto.jpg', { type: 'image/jpeg' });
      verwerkBestand(bestand);
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActief(false);
  };

  const startSpaak = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setFout('Spraakherkenning niet beschikbaar.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'nl-NL';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setSpaakActief(true);
    recognition.onresult = (e) => {
      const tekst = e.results[0][0].transcript;
      setSpaakTekst(tekst);
      setChatInput(prev => prev + (prev ? ' ' : '') + tekst);
    };
    recognition.onend = () => setSpaakActief(false);
    recognition.onerror = () => setSpaakActief(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopSpaak = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setSpaakActief(false);
  };

  const fotoNaarBase64 = (fotoBestand) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(fotoBestand);
  });

  const analyseer = async () => {
    if (!foto) return;
    setLaden(true);
    setFout('');
    setRapport('');
    try {
      const base64 = await fotoNaarBase64(foto);
      const vraag = (chatInput || spraakTekst) || 'Analyseer dit gebouw professioneel en gedetailleerd.';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: foto.type || 'image/jpeg', data: base64 } },
              { type: 'text', text: `Je bent een expert gebouwinspecteur. Geef een professioneel inspectierapport in het Nederlands.

Structureer je rapport als volgt:
## Gebouwtype en Algemeen
## Staat van het Gebouw
## Geconstateerde Gebreken
## Positieve Punten
## Aanbevelingen en Prioriteiten
## Algehele Conditiescore (1-10)

Vraag inspecteur: ${vraag}` }
            ]
          }]
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const rapportTekst = data.content[0].text;
      setRapport(rapportTekst);
      setChatGeschiedenis([
        { rol: 'inspecteur', tekst: vraag, type: 'vraag' },
        { rol: 'ai', tekst: rapportTekst, type: 'rapport' }
      ]);
      setFase('chat');
    } catch (e) { setFout('Fout: ' + e.message); }
    setLaden(false);
  };

  const stuurChatBericht = async () => {
    if (!chatInput.trim() || !foto) return;
    const vraag = chatInput.trim();
    setChatInput('');
    const nieuweGeschiedenis = [...chatGeschiedenis, { rol: 'inspecteur', tekst: vraag, type: 'vraag' }];
    setChatGeschiedenis(nieuweGeschiedenis);
    setLaden(true);
    try {
      const base64 = await fotoNaarBase64(foto);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: foto.type || 'image/jpeg', data: base64 } },
            { type: 'text', text: 'Je bent een expert gebouwinspecteur. Vorig rapport:

' + rapport + '

Vraag: ' + vraag }
          ]}]
        })
      });
      const data = await response.json();
      const antwoord = data.content[0].text;
      setChatGeschiedenis([...nieuweGeschiedenis, { rol: 'ai', tekst: antwoord, type: 'antwoord' }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { setFout('Chat fout: ' + e.message); }
    setLaden(false);
  };

  const reset = () => {
    setFoto(null); setPreview(null); setRapport(''); setFout('');
    setSpaakTekst(''); setChatGeschiedenis([]); setChatInput(''); setFase('upload');
    stopCamera();
  };

  const renderMarkdown = (tekst) => tekst
    .replace(/## (.*)/g, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          <div className="logo-icon">🏗️</div>
          <div>
            <h1>GebouwInspectie Pro</h1>
            <span className="header-sub">AI-gedreven gebouwanalyse</span>
          </div>
        </div>
        <div className="header-rechts">
          <span className="badge-ai">Claude 3.5 Sonnet</span>
          {foto && <button className="btn-reset" onClick={reset}>↩ Nieuwe inspectie</button>}
        </div>
      </header>

      <main className="main">
        {cameraActief && (
          <div className="camera-modal">
            <div className="camera-container">
              <div className="camera-header">
                <span>📷 Camera</span>
                <button className="btn-sluit" onClick={stopCamera}>✕</button>
              </div>
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="camera-knoppen">
                <button className="btn-foto-maken" onClick={maakFoto}><span className="shutter" /></button>
              </div>
            </div>
          </div>
        )}

        {fase === 'upload' && !foto && (
          <div className="upload-sectie">
            <div className="upload-titel">
              <h2>Start nieuwe inspectie</h2>
              <p>Upload een foto of maak direct een opname van het gebouw</p>
            </div>
            <div className="dropzone" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
              <div className="dropzone-inhoud">
                <div className="dropzone-icoon">📁</div>
                <p className="dropzone-titel">Sleep een foto hierheen</p>
                <p className="dropzone-sub">of klik om een bestand te kiezen</p>
                <p className="dropzone-formaten">JPG, PNG, HEIC</p>
              </div>
            </div>
            <div className="of-divider"><span>of</span></div>
            <button className="btn-camera-groot" onClick={startCamera}>📷 Open camera</button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          </div>
        )}

        {foto && fase === 'upload' && (
          <div className="analyse-sectie">
            <div className="foto-panel">
              <div className="foto-header">
                <span className="foto-label">📸 Geselecteerde foto</span>
                <button className="btn-wissel" onClick={() => fileInputRef.current?.click()}>Andere foto</button>
                <button className="btn-wissel" onClick={startCamera}>📷 Camera</button>
              </div>
              <img src={preview} alt="Gebouw" className="foto-preview" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
            </div>
            <div className="vraag-panel">
              <h3>Specifieke vraag (optioneel)</h3>
              <div className="spraak-invoer">
                <textarea
                  className="spraak-tekstvak"
                  placeholder="Bijv: Let op de fundering en het dak..."
                  value={chatInput || spraakTekst}
                  onChange={(e) => setChatInput(e.target.value)}
                  rows={3}
                />
                <button
                  className={`btn-spraak ${spraakActief ? 'actief' : ''}`}
                  onMouseDown={startSpaak} onMouseUp={stopSpaak}
                  onTouchStart={startSpaak} onTouchEnd={stopSpaak}
                  title="Houd ingedrukt om in te spreken"
                >
                  {spraakActief ? '🔴' : '🎙️'}
                </button>
              </div>
              {spraakActief && <p className="spraak-status">🔴 Luisteren...</p>}
              {fout && <div className="fout-melding">⚠️ {fout}</div>}
              <button className="btn-analyseer" onClick={analyseer} disabled={laden}>
                {laden ? <><span className="spinner" /> Analyseren...</> : '🔍 Analyseer gebouw'}
              </button>
            </div>
          </div>
        )}

        {fase === 'chat' && (
          <div className="rapport-sectie">
            <div className="rapport-links">
              <img src={preview} alt="Gebouw" className="foto-klein" />
              <button className="btn-wissel-klein" onClick={() => { setFase('upload'); }}>↩ Terug</button>
            </div>
            <div className="rapport-rechts">
              <div className="chat-berichten">
                {chatGeschiedenis.map((bericht, i) => (
                  <div key={i} className={`chat-bericht ${bericht.rol}`}>
                    <div className="bericht-avatar">{bericht.rol === 'ai' ? '🏗️' : '👤'}</div>
                    <div className="bericht-inhoud">
                      <span className="bericht-naam">{bericht.rol === 'ai' ? 'GebouwAI' : 'Inspecteur'}</span>
                      {bericht.type === 'rapport' || bericht.type === 'antwoord'
                        ? <div className="bericht-tekst rapport-tekst" dangerouslySetInnerHTML={{ __html: renderMarkdown(bericht.tekst) }} />
                        : <div className="bericht-tekst">{bericht.tekst}</div>
                      }
                    </div>
                  </div>
                ))}
                {laden && (
                  <div className="chat-bericht ai">
                    <div className="bericht-avatar">🏗️</div>
                    <div className="bericht-inhoud">
                      <span className="bericht-naam">GebouwAI</span>
                      <div className="typing-indicator"><span/><span/><span/></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-invoer-balk">
                <div className="chat-invoer-wrapper">
                  <textarea
                    className="chat-tekstvak"
                    placeholder="Stel een vervolgvraag..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stuurChatBericht(); }}}
                    rows={2}
                  />
                  <div className="chat-invoer-knoppen">
                    <button
                      className={`btn-spraak-chat ${spraakActief ? 'actief' : ''}`}
                      onMouseDown={startSpaak} onMouseUp={stopSpaak}
                      onTouchStart={startSpaak} onTouchEnd={stopSpaak}
                    >
                      {spraakActief ? '🔴' : '🎙️'}
                    </button>
                    <button className="btn-verstuur" onClick={stuurChatBericht} disabled={laden || !chatInput.trim()}>
                      {laden ? <span className="spinner-wit" /> : '➤'}
                    </button>
                  </div>
                </div>
                {spraakActief && <p className="spraak-status">🔴 Luisteren...</p>}
                {fout && <div className="fout-melding">⚠️ {fout}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
