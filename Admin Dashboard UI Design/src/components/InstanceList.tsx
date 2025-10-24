import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

export default function InstanceList() {
  const [instances, setInstances] = useState<any[]>([]);
  const [histories, setHistories] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/instances`);
        if (!r.ok) return;
        const list = await r.json();
        if (!mounted) return;
        setInstances(list);
        // fetch histories in parallel (best-effort)
        for (const inst of list) {
          (async (id: string) => {
            try {
              const h = await fetch(`${API_BASE}/instances/${id}/stats/history`);
              if (!h.ok) return;
              const arr = await h.json();
              if (!mounted) return;
              setHistories((s) => ({ ...s, [id]: arr }));
            } catch (e) { /* ignore per-instance failures */ }
          })(inst.id);
        }
      } catch (e) { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  return (
    <div className="space-y-4">
      {instances.map((inst) => {
        const hist = histories[inst.id] || [];
        const cpuSeries = hist.map((s: any) => ({ time: s.timestamp, cpu: s.cpuPercent || 0 }));
        const latest = cpuSeries.length ? cpuSeries[cpuSeries.length - 1].cpu : (inst.cpuUsage || 0);
        const ramLatest = hist.length ? (hist[hist.length - 1].memoryMB || inst.ramUsage || 0) : (inst.ramUsage || 0);
        return (
          <div key={inst.id} className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-white" style={{ fontFamily: 'monospace' }}>{inst.name}</span>
              <div className="flex gap-4">
                <span className="text-[#0066cc] text-sm" style={{ fontFamily: 'monospace' }}>
                  CPU: {latest}%
                </span>
                <span className="text-[#00aaff] text-sm" style={{ fontFamily: 'monospace' }}>
                  RAM: {Math.round(ramLatest)} MB
                </span>
              </div>
            </div>
            <div className="h-10">
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={cpuSeries.length ? cpuSeries : [{ time: Date.now(), cpu: inst.cpuUsage || 0 }] }>
                  <Line type="monotone" dataKey="cpu" stroke="#00aaff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
