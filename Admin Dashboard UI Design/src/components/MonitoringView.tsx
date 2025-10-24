import { useEffect, useState } from 'react';
import { Card } from "./ui/card";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

// Mock/chart data left as-is to show graphs
const cpuData = [
  { time: "00:00", usage: 45 },
  { time: "00:05", usage: 52 },
  { time: "00:10", usage: 48 },
  { time: "00:15", usage: 65 },
  { time: "00:20", usage: 58 },
  { time: "00:25", usage: 71 },
  { time: "00:30", usage: 63 },
  { time: "00:35", usage: 55 },
  { time: "00:40", usage: 48 },
  { time: "00:45", usage: 52 },
];

const ramData = [
  { time: "00:00", usage: 12.4 },
  { time: "00:05", usage: 13.1 },
  { time: "00:10", usage: 12.8 },
  { time: "00:15", usage: 14.2 },
  { time: "00:20", usage: 15.6 },
  { time: "00:25", usage: 16.8 },
  { time: "00:30", usage: 15.2 },
  { time: "00:35", usage: 14.5 },
  { time: "00:40", usage: 13.9 },
  { time: "00:45", usage: 14.1 },
];

const networkData = [
  { time: "00:00", in: 125, out: 89 },
  { time: "00:05", in: 145, out: 102 },
  { time: "00:10", in: 132, out: 95 },
  { time: "00:15", in: 178, out: 124 },
  { time: "00:20", in: 165, out: 118 },
  { time: "00:25", in: 189, out: 135 },
  { time: "00:30", in: 172, out: 128 },
  { time: "00:35", in: 156, out: 112 },
  { time: "00:40", in: 148, out: 105 },
  { time: "00:45", in: 162, out: 115 },
];

const instanceStats = [
  { name: "ROS2-Nav", cpu: 68, ram: 2.4 },
  { name: "Gazebo-TB3", cpu: 82, ram: 3.8 },
  { name: "PX4-SITL", cpu: 45, ram: 1.6 },
  { name: "MoveIt2", cpu: 72, ram: 2.9 },
  { name: "Autoware", cpu: 91, ram: 5.2 },
  { name: "ArduPilot", cpu: 38, ram: 1.2 },
];

export function MonitoringView() {
  const [summary, setSummary] = useState<any>(null);
  const [cpuSeries, setCpuSeries] = useState<any[]>(cpuData);
  const [ramSeries, setRamSeries] = useState<any[]>(ramData);
  const [networkSeries, setNetworkSeries] = useState<any[]>(networkData);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // Fetch both summary and time series for charts
        const [sumR, seriesR] = await Promise.all([
          fetch(`${API_BASE}/monitor/summary`),
          fetch(`${API_BASE}/monitor/series`),
        ]);
        if (!sumR.ok) return;
        const j = await sumR.json();
        let seriesJson = null;
        if (seriesR.ok) seriesJson = await seriesR.json();
        if (!mounted) return;
        setSummary(j);
        if (seriesJson && seriesJson.cpu) {
          // map timestamps to time labels
          const cpuMapped = seriesJson.cpu.map((s: any) => ({ time: new Date(s.time).toLocaleTimeString(), usage: s.value }));
          const ramMapped = seriesJson.ram.map((s: any) => ({ time: new Date(s.time).toLocaleTimeString(), usage: +(s.usedMB / 1024).toFixed(2) }));
          setCpuSeries(cpuMapped.length ? cpuMapped : cpuData);
          setRamSeries(ramMapped.length ? ramMapped : ramData);
          // network series for chart
          if (seriesJson.network) {
            const netMapped = seriesJson.network.map((s: any) => ({ time: new Date(s.time).toLocaleTimeString(), in: s.inKB || 0, out: s.outKB || 0 }));
            setNetworkSeries(netMapped.length ? netMapped : networkData);
          }
        }
      } catch (e) {
        // ignore
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#141414] border-[#2a2a2a] rounded p-4 text-white">
          <div className="text-sm text-gray-400">Total Instances</div>
          <div className="text-2xl font-mono">{summary ? summary.totalInstances : '-'}</div>
          <div className="text-xs text-gray-500">{summary ? summary.running : '-'} running</div>
        </div>

        <div className="bg-[#141414] border-[#2a2a2a] rounded p-4 text-white">
          <div className="text-sm text-gray-400">Avg CPU Usage</div>
          <div className="text-2xl font-mono">{summary ? summary.avgCpu : '-'}%</div>
          <div className="text-xs text-gray-500">Across all instances</div>
        </div>

        <div className="bg-[#141414] border-[#2a2a2a] rounded p-4 text-white">
          <div className="text-sm text-gray-400">Total RAM</div>
          <div className="text-2xl font-mono">{summary ? (summary.totalRamMB/1024).toFixed(1) : '-'} GB</div>
          <div className="text-xs text-gray-500">Used {summary ? (summary.usedRamMB/1024).toFixed(1) : '-'} GB</div>
        </div>

        <div className="bg-[#141414] border-[#2a2a2a] rounded p-4 text-white">
          <div className="text-sm text-gray-400">System Health</div>
          <div className="text-2xl font-mono">{summary ? (summary.running > 0 ? 'Healthy' : 'Idle') : '-'}</div>
          <div className="text-xs text-gray-500">Realtime system summary</div>
        </div>
      </div>

      {/* Charts (mock data) */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-4">CPU Usage Over Time</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={cpuSeries}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.9}/>
                <stop offset="95%" stopColor="#00E5FF" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="time" stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <YAxis stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0a0a0a', 
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                fontFamily: 'monospace'
              }}
              labelStyle={{ color: '#999' }}
              itemStyle={{ color: '#00E5FF' }}
            />
            <Area type="monotone" dataKey="usage" stroke="#00E5FF" fillOpacity={1} fill="url(#cpuGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-4">Memory Usage Over Time (GB)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={ramSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="time" stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <YAxis stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0a0a0a', 
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                fontFamily: 'monospace'
              }}
              labelStyle={{ color: '#999' }}
            />
            <Line type="monotone" dataKey="usage" stroke="#00E5FF" strokeWidth={2} dot={{ fill: '#00E5FF' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-4">Network Traffic (MB/s)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={networkSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="time" stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <YAxis stroke="#666" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0a0a0a', 
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                fontFamily: 'monospace'
              }}
              labelStyle={{ color: '#999' }}
            />
            <Bar dataKey="in" fill="#00E5FF" />
            <Bar dataKey="out" fill="#00E5FF" />
          </BarChart>
        </ResponsiveContainer>
      </Card>


      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-white mb-2">Monitoring Integration</h3>
            <p className="text-[#666] text-sm mb-4">
              Real-time metrics powered by cAdvisor and Prometheus
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[#999] text-sm">cAdvisor endpoint: </span>
                <code className="text-[#0066cc] text-sm" style={{ fontFamily: 'monospace' }}>
                  http://localhost:8080
                </code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[#999] text-sm">Update interval: </span>
                <code className="text-white text-sm" style={{ fontFamily: 'monospace' }}>
                  5 seconds
                </code>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default MonitoringView;
