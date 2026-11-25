import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Modal, Icon, Spinner, Tabs, useToast } from '../ui';
import { loadFaceModels, startCamera, stopCamera, describeSingleFace, fileToImage } from '../face';
import { useAsync } from '../util';

// Enroll a student's face from uploaded photos or a live camera capture.
export default function FaceEnroll({ student, onClose, onSaved }) {
  const toast = useToast();
  const [engine, setEngine] = useState({ state: 'loading', msg: 'Preparing face recognition...' });
  const [tab, setTab] = useState('upload'); const [samples, setSamples] = useState([]); // {descriptor, photo, name}
  const [busy, setBusy] = useState(false); const [issues, setIssues] = useState([]); const [mode, setMode] = useState(student.face_enrolled ? 'replace' : 'replace');
  const current = useAsync(() => (student.face_enrolled ? api.get(`/students/${student.id}/photo`) : Promise.resolve({ photo: null })), [student.id]);

  useEffect(() => { let alive = true; loadFaceModels((m) => alive && setEngine({ state: 'loading', msg: m })).then(() => alive && setEngine({ state: 'ready' })).catch((e) => alive && setEngine({ state: 'error', msg: e.message })); return () => { alive = false; }; }, []);

  const room = 5 - samples.length;
  async function addFiles(files) {
    const list = Array.from(files).slice(0, room); const bad = [];
    if (files.length > room) bad.push(`Only ${room} more photo(s) can be added (max 5 samples).`);
    setBusy(true);
    for (const file of list) {
      try { const img = await fileToImage(file); const r = await describeSingleFace(img); setSamples((s) => [...s, { ...r, name: file.name }]); }
      catch (e) { bad.push(`${file.name}: ${e.message}`); }
    }
    setIssues(bad); setBusy(false);
  }

  // ----- camera tab -----
  const videoRef = useRef(null); const streamRef = useRef(null); const [camOn, setCamOn] = useState(false); const [camErr, setCamErr] = useState('');
  async function startCam() { setCamErr(''); try { streamRef.current = await startCamera(videoRef.current); setCamOn(true); } catch (e) { setCamErr(e.message); } }
  function stopCam() { stopCamera(streamRef.current, videoRef.current); streamRef.current = null; setCamOn(false); }
  useEffect(() => () => stopCamera(streamRef.current, videoRef.current), []);
  useEffect(() => { if (tab !== 'camera' && camOn) stopCam(); }, [tab]); // eslint-disable-line
  async function capture() {
    if (samples.length >= 5) return setIssues(['You already have 5 samples.']);
    setBusy(true);
    try { const r = await describeSingleFace(videoRef.current); setSamples((s) => [...s, { ...r, name: 'Camera capture' }]); setIssues([]); }
    catch (e) { setIssues([e.message]); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    try {
      await api.post(`/students/${student.id}/face`, { descriptors: samples.map((s) => s.descriptor), photo: samples[0].photo, mode });
      toast.success(`Face enrolled for ${student.name}`); onSaved();
    } catch (e) { setIssues([e.message]); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Face enrollment - ${student.name}`} onClose={() => { stopCam(); onClose(); }} size="lg"
      footer={<><button className="btn btn-ghost" onClick={() => { stopCam(); onClose(); }}>Cancel</button>
        <button className="btn btn-primary" disabled={!samples.length || busy || engine.state !== 'ready'} onClick={save}>{busy ? 'Working...' : `Save ${samples.length || ''} sample${samples.length === 1 ? '' : 's'}`}</button></>}>
      <div className="enroll">
        <div className="enroll-meta"><strong>{student.roll_no}</strong> - {student.course_code} Sem {student.semester}
          {student.face_enrolled && <span className="muted-text"> - currently {student.face_samples} sample(s) enrolled</span>}</div>
        {engine.state === 'loading' && <Spinner label={engine.msg} />}
        {engine.state === 'error' && <div className="callout danger"><Icon name="alert" />{engine.msg}</div>}
        {engine.state === 'ready' && (
          <>
            <div className="callout info"><Icon name="info" />Use 2-3 clear, front-facing, well-lit photos (one person only). More variety (glasses, lighting) improves accuracy. Raw photos are not kept; only a small encrypted thumbnail and face descriptors are stored.</div>
            <Tabs tabs={[{ value: 'upload', label: 'Upload photos', icon: 'upload' }, { value: 'camera', label: 'Use camera', icon: 'camera' }]} value={tab} onChange={setTab} />
            {tab === 'upload' ? (
              <label className="dropzone">
                <Icon name="upload" size={26} /><strong>Choose photos</strong><span>JPG, PNG or WebP - up to {room} more</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || room <= 0} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
            ) : (
              <div className="enroll-cam">
                <div className="camera-stage small"><video ref={videoRef} playsInline muted className="mirror" />{!camOn && <div className="camera-placeholder"><Icon name="camera" size={30} /><span>Camera is off</span></div>}</div>
                {camErr && <div className="callout danger"><Icon name="alert" />{camErr}</div>}
                <div className="row-actions">{!camOn ? <button className="btn btn-primary" onClick={startCam}><Icon name="camera" />Start camera</button> : <><button className="btn btn-primary" onClick={capture} disabled={busy}><Icon name="scan" />Capture face</button><button className="btn btn-ghost" onClick={stopCam}>Stop</button></>}</div>
              </div>
            )}
            {issues.map((m, i) => <div key={i} className="callout warn" role="alert"><Icon name="alert" />{m}</div>)}
            {busy && <Spinner label="Analysing face..." />}
            {samples.length > 0 && (
              <>
                <div className="sample-grid">{samples.map((s, i) => (
                  <figure key={i} className="sample"><img src={s.photo} alt={`Sample ${i + 1}`} /><figcaption>Sample {i + 1}</figcaption>
                    <button className="icon-btn sample-x" aria-label="Remove sample" onClick={() => setSamples(samples.filter((_, k) => k !== i))}><Icon name="x" size={14} /></button></figure>
                ))}</div>
                {student.face_enrolled && (
                  <div className="radio-row"><label><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace existing samples</label>
                    <label><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> Add to existing samples</label></div>
                )}
              </>
            )}
            {current.data?.photo && samples.length === 0 && <div className="current-photo"><img src={current.data.photo} alt="Current enrolled face" /><span className="muted-text">Currently enrolled photo</span></div>}
          </>
        )}
      </div>
    </Modal>
  );
}
