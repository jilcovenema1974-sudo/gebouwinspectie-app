import React, { useState, useRef } from 'react';
import './App.css';

function App() {
    const [foto, setFoto] = useState(null);
    const [preview, setPreview] = useState(null);
    const [rapport, setRapport] = useState('');
    const [laden, setLaden] = useState(false);
    const [fout, setFout] = useState('');
    const fileInputRef = useRef(null);

  const handleFotoKiezen = (e) => {
        const bestand = e.target.files[0];
        if (bestand) {
                setFoto(bestand);
                setPreview(URL.createObjectURL(bestand));
                setRapport('');
                setFout('');
        }
  };

  const handleNieuweAnalyse = () => {
        setFoto(null);
        setPreview(null);
        setRapport('');
        setFout('');
        if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyseer = async () => {
        if (!foto) { setFout('Kies eerst een foto.'); return; }
        setLaden(true);
        setFout('');
        setRapport('');

        try {
                const reader = new FileReader();
                reader.readAsDataURL(foto);
                reader.onloadend = async () => {
                          const base64 = reader.result.split(',')[1];
                          const response = await fetch('/api/analyseer', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ afbeelding: base64, type: foto.type }),
                          });
                          if (!response.ok) {
                                      const err = await response.json();
                                      throw new Error(err.fout || 'Serverfout');
                          }
                          const data = await response.json();
                          setRapport(data.rapport);
                          setLaden(false);
                };
        } catch (err) {
                setFout(err.message);
                setLaden(false);
        }
  };

  return (
        <div className="app">
          <aside className="sidebar">
            <div className="sidebar-logo">
              <div className="logo-icon">G</div>
            <span className="logo-text">GebouwAI</span>
    </div>
          <nav className="sidebar-nav">
              <button className="nav-item active">
                <span className="nav-icon">🏛️</span>
              <span>Nieuwe inspectie</span>
    </button>
            <button className="nav-item" onClick={handleNieuweAnalyse}>
                <span className="nav-icon">🔄</span>
              <span>Reset</span>
    </button>
    </nav>
          <div className="sidebar-footer">
              <div className="model-badge">Claude 3.5 Sonnet</div>
    </div>
    </aside>

      <main className="main-content">
            <div className="chat-container">
              <div className="chat-header">
                <h1>Gebouwinspectie AI</h1>
              <p>Upload een foto van een gebouw voor een gedetailleerde AI-analyse</p>
    </div>

          <div className="upload-area">
  {!preview ? (
                  <label className="dropzone">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFotoKiezen}
                      className="file-input-hidden"
                    />
                    <div className="dropzone-content">
                      <div className="upload-icon">📷</div>
                      <p className="dropzone-title">Foto uploaden</p>
                      <p className="dropzone-sub">Klik om een foto te kiezen of sleep een afbeelding hierheen</p>
                      <button type="button" className="btn-upload">Kies foto</button>
    </div>
    </label>
                ) : (
                  <div className="preview-container">
                    <img src={preview} alt="Gebouw preview" className="preview-img" />
                    <div className="preview-overlay">
                      <button className="btn-change" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                        📷 Andere foto
    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFotoKiezen}
                      className="file-input-hidden"
                    />
                        </div>
                  <div className="preview-filename">{foto && foto.name}</div>
  </div>
            )}
</div>

          <div className="action-bar">
              <button
              className={`btn-analyse ${laden ? 'loading' : ''}`}
              onClick={handleAnalyseer}
              disabled={!foto || laden}
            >
              {laden ? (
                                <><span className="spinner"></span> Analyseren...</>
                              ) : (
                                                <><span>🔍</span> Analyseer gebouw</>
                              )}
                </button>
{(rapport || fout) && (
                <button className="btn-reset" onClick={handleNieuweAnalyse}>
                  🔄 Nieuwe analyse
  </button>
             )}
</div>

{fout && (
              <div className="fout-melding">
                <span>⚠️</span> {fout}
  </div>
           )}

{rapport && (
              <div className="rapport-container">
                <div className="rapport-header">
                  <div className="rapport-avatar">G</div>
                 <div className="rapport-meta">
                    <strong>GebouwAI</strong>
                   <span>Inspectierapport</span>
  </div>
  </div>
               <div className="rapport-body">
                  <pre className="rapport-tekst">{rapport}</pre>
  </div>
  </div>
           )}
</div>
  </main>
  </div>
  );
}

export default App;
