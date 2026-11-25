import React, { useRef, useState } from 'react';
import { statusColor } from './util';

// Lightweight, dependency-free SVG charts that follow the app theme (light/dark).
const W = 640; const PAD = { l: 38, r: 14, t: 14, b: 30 };

function xTicks(labels, max = 7) {
  if (labels.length <= max) return labels.map((_, i) => i);
  const step = Math.ceil(labels.length / max); const out = [];
  for (let i = 0; i < labels.length; i += step) out.push(i);
  return out;
}

function Grid({ H, yMax = 100, threshold }) {
  const ih = H - PAD.t - PAD.b; const y = (v) => PAD.t + ih - (v / yMax) * ih;
  return (
    <g>
      {[0, 25, 50, 75, 100].filter((v) => v <= yMax).map((v) => (
        <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">{v}%</text></g>
      ))}
      {threshold != null && <g><line x1={PAD.l} x2={W - PAD.r} y1={y(threshold)} y2={y(threshold)} className="chart-threshold" /><text x={W - PAD.r} y={y(threshold) - 4} textAnchor="end" className="chart-threshold-label">Min {threshold}%</text></g>}
    </g>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}

function useHover(count, H) {
  const ref = useRef(null); const [idx, setIdx] = useState(null);
  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const x = (cx / rect.width) * W; const iw = W - PAD.l - PAD.r;
    const i = Math.round(((x - PAD.l) / iw) * (count - 1 || 1));
    setIdx(Math.max(0, Math.min(count - 1, i)));
  };
  return { ref, idx, setIdx, onMove, onLeave: () => setIdx(null), H };
}

export function LineChart({ labels, series, threshold, height = 240, unit = '%' }) {
  const H = height; const hv = useHover(labels.length, H);
  const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (v / 100) * ih;
  if (!labels.length) return <div className="chart-empty">No data for this period</div>;
  return (
    <div className="chart" ref={hv.ref} onMouseMove={hv.onMove} onTouchStart={hv.onMove} onTouchMove={hv.onMove} onMouseLeave={hv.onLeave}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart">
        <Grid H={H} threshold={threshold} />
        {xTicks(labels).map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">{labels[i]}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
          const segs = []; let cur = [];
          pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
          return (
            <g key={s.name}>
              {s.area && segs.map((sg, k) => <path key={k} d={`M${sg[0][0]},${y(0)} ${sg.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${sg[sg.length - 1][0]},${y(0)}Z`} fill={s.color} opacity="0.12" />)}
              {segs.map((sg, k) => <polyline key={k} points={sg.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />)}
              {labels.length <= 40 && pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hv.idx === i ? 5 : 3} fill="var(--card)" stroke={s.color} strokeWidth="2" />)}
            </g>
          );
        })}
        {hv.idx !== null && <line x1={x(hv.idx)} x2={x(hv.idx)} y1={PAD.t} y2={H - PAD.b} className="chart-cursor" />}
      </svg>
      {hv.idx !== null && (
        <div className="chart-tip" style={{ left: `${(x(hv.idx) / W) * 100}%` }}>
          <strong>{labels[hv.idx]}</strong>
          {series.map((s) => <div key={s.name}><i style={{ background: s.color }} />{s.name}: {s.values[hv.idx] == null ? '-' : `${s.values[hv.idx]}${unit}`}</div>)}
        </div>
      )}
    </div>
  );
}

export function BarChart({ labels, values, threshold, height = 240, color, tooltipExtra }) {
  const H = height; const hv = useHover(labels.length, H);
  const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(labels.length, 1); const bw = Math.min(46, slot * 0.62);
  const y = (v) => PAD.t + ih - (v / 100) * ih;
  if (!labels.length) return <div className="chart-empty">No data for this period</div>;
  const slotIdx = (i) => PAD.l + slot * i + slot / 2;
  return (
    <div className="chart" ref={hv.ref} onMouseLeave={hv.onLeave} onMouseMove={(e) => {
      const r = hv.ref.current.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
      hv.setIdx(Math.max(0, Math.min(labels.length - 1, Math.floor((x - PAD.l) / slot))));
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
        <Grid H={H} threshold={threshold} />
        {labels.map((l, i) => {
          const v = values[i]; if (v == null) return null;
          return (
            <g key={i}>
              <rect x={slotIdx(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx="4" fill={color || statusColor(v, threshold ?? 75)} opacity={hv.idx === null || hv.idx === i ? 1 : 0.55} />
              {labels.length <= 14 && <text x={slotIdx(i)} y={y(v) - 5} textAnchor="middle" className="chart-value">{v}</text>}
              {(labels.length <= 10 || i % Math.ceil(labels.length / 8) === 0) && <text x={slotIdx(i)} y={H - 8} textAnchor="middle" className="chart-axis">{l.length > 10 ? l.slice(0, 9) + '.' : l}</text>}
            </g>
          );
        })}
      </svg>
      {hv.idx !== null && values[hv.idx] != null && <div className="chart-tip" style={{ left: `${(slotIdx(hv.idx) / W) * 100}%` }}><strong>{labels[hv.idx]}</strong><div>{values[hv.idx]}%{tooltipExtra ? ` ${tooltipExtra(hv.idx)}` : ''}</div></div>}
    </div>
  );
}

// Plain count bars (e.g., attendance distribution)
export function CountBars({ items, height = 200 }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="count-bars" style={{ height }}>
      {items.map((i) => (
        <div key={i.label} className="count-col" title={`${i.label}: ${i.count} students`}>
          <span className="count-val">{i.count}</span>
          <div className="count-bar" style={{ height: `${(i.count / max) * 100}%`, background: i.color || 'var(--primary)' }} />
          <span className="count-label">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 160, center, sub }) {
  const total = segments.reduce((s, x) => s + x.value, 0); const r = 54; const c = 2 * Math.PI * r; let acc = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" role="img" aria-label="Donut chart">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c; const el = <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${s.label}: ${s.value}`}</title></circle>;
          acc += len; return el;
        })}
      </svg>
      <div className="donut-center"><strong>{center}</strong>{sub && <span>{sub}</span>}</div>
    </div>
  );
}

export function Ring({ value, size = 132, threshold = 75, label = 'Attendance' }) {
  const r = 52; const c = 2 * Math.PI * r; const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label} ${value ?? 0}%`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={statusColor(value, threshold)} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
      </svg>
      <div className="donut-center"><strong>{value == null ? '-' : `${value}%`}</strong><span>{label}</span></div>
    </div>
  );
}

// Horizontal list of percentages (per subject / class)
export function PctList({ items, threshold = 75 }) {
  if (!items.length) return <div className="chart-empty">No data for this period</div>;
  return (
    <div className="pct-list">
      {items.map((i) => (
        <div key={i.key} className="pct-row">
          <div className="pct-top"><span className="pct-name">{i.label}{i.sub && <small>{i.sub}</small>}</span><strong style={{ color: statusColor(i.value, threshold) }}>{i.value == null ? '-' : `${i.value}%`}</strong></div>
          <div className="progress"><span style={{ width: `${i.value ?? 0}%`, background: statusColor(i.value, threshold) }} /><i className="progress-mark" style={{ left: `${threshold}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
