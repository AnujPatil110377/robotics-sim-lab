import { Play, Square, RotateCw, Trash2, ExternalLink, Monitor, Chrome } from "lucide-react";
import { useEffect, useState } from 'react';
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";

export interface Instance {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  image: string;
  cpuUsage: number;
  ramUsage: number;
  ramTotal: number;
  uptime: string;
  novncUrl: string;
  chromeRdUrl: string;
}

interface InstanceCardProps {
  instance: Instance;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onRestart?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

export function InstanceCard({ instance, onStart, onStop, onRestart, onDelete }: InstanceCardProps) {
  const statusColors = {
    running: "bg-green-500",
    stopped: "bg-gray-500",
    error: "bg-red-500",
  };

  const statusLabels = {
    running: "Running",
    stopped: "Stopped",
    error: "Error",
  };

  const statusBadgeColors = {
    running: "bg-green-500/20 text-green-400 border-green-500/30",
    stopped: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  // Live stats (simple in-component polling)
  const [cpuHistory, setCpuHistory] = useState<number[]>(() => Array(20).fill(instance.cpuUsage || 0));
  const [ramHistory, setRamHistory] = useState<number[]>(() => Array(20).fill(instance.ramUsage || 0));

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const url = API_BASE ? `${API_BASE}/instances/${instance.id}/stats` : `/instances/${instance.id}/stats`;
        const res = await fetch(url);
        if (!res.ok) return;
        const j = await res.json();
        const cpu = typeof j.cpuPercent === 'number' ? Math.max(0, Math.min(100, j.cpuPercent)) : 0;
        const ram = typeof j.memoryMB === 'number' ? j.memoryMB : 0;
        if (!mounted) return;
        setCpuHistory((s) => [...s.slice(-19), cpu]);
        setRamHistory((s) => [...s.slice(-19), ram]);
      } catch (e) {
        // ignore errors during polling
      }
    };

    // Try to prefill history from server-side buffer if available
    (async () => {
      try {
        const histUrl = API_BASE ? `${API_BASE}/instances/${instance.id}/stats/history` : `/instances/${instance.id}/stats/history`;
        const r = await fetch(histUrl);
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr) && arr.length) {
            const cpuArr = arr.map((s: any) => (typeof s.cpuPercent === 'number' ? Math.max(0, Math.min(100, s.cpuPercent)) : 0));
            const ramArr = arr.map((s: any) => (typeof s.memoryMB === 'number' ? s.memoryMB : 0));
            // keep only the last 20 samples
            const c = cpuArr.slice(-20);
            const m = ramArr.slice(-20);
            if (mounted) {
              setCpuHistory(() => Array(Math.max(0, 20 - c.length)).fill(0).concat(c));
              setRamHistory(() => Array(Math.max(0, 20 - m.length)).fill(0).concat(m));
            }
          }
        }
      } catch (e) { /* ignore */ }
      // start real-time polling after attempting to fill history
      fetchStats();
      const iv = setInterval(fetchStats, 2000);
      return () => { mounted = false; clearInterval(iv); };
    })();
  }, [instance.id]);

  const latestCpu = cpuHistory[cpuHistory.length - 1] ?? instance.cpuUsage ?? 0;
  const latestRam = ramHistory[ramHistory.length - 1] ?? instance.ramUsage ?? 0;

  return (
    <Card className="bg-[#141414] border-[#2a2a2a] p-5 hover:border-[#0066cc]/50 transition-all">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${statusColors[instance.status]} animate-pulse`} />
              <h3 className="text-white" style={{ fontFamily: 'monospace' }}>{instance.name}</h3>
            </div>
            <p className="text-[#666] text-sm" style={{ fontFamily: 'monospace' }}>
              ID: {instance.id.substring(0, 12)}
            </p>
          </div>
          <Badge className={`${statusBadgeColors[instance.status]} border`}>
            {statusLabels[instance.status]}
          </Badge>
        </div>

        {/* Image Info */}
        <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1f1f1f]">
          <p className="text-[#999] text-xs mb-1">Docker Image</p>
          <p className="text-white text-sm" style={{ fontFamily: 'monospace' }}>{instance.image}</p>
        </div>

        {/* Resource Usage */}
        <div className="space-y-3">
          {/* CPU */}
          <div>
              <div className="flex justify-between mb-2">
                <span className="text-[#999] text-sm">CPU Usage</span>
                <span className="text-white text-sm" style={{ fontFamily: 'monospace' }}>
                  {latestCpu}%
                </span>
              </div>
              <Progress 
                value={Math.max(0, Math.min(100, latestCpu))} 
                className="h-2 bg-[#1a1a1a]"
                indicatorStyle={{ backgroundColor: '#00E5FF', boxShadow: '0 0 8px rgba(0,229,255,0.45)' }}
              />
          </div>

          {/* RAM */}
          <div>
              <div className="flex justify-between mb-2">
                <span className="text-[#999] text-sm">RAM Usage</span>
                <span className="text-white text-sm" style={{ fontFamily: 'monospace' }}>
                  {latestRam}MB / {instance.ramTotal || 0}MB
                </span>
              </div>
              <Progress 
                value={instance.ramTotal ? Math.round((latestRam / instance.ramTotal) * 100) : 0} 
                className="h-2 bg-[#1a1a1a]"
                indicatorStyle={{ backgroundColor: '#00E5FF', boxShadow: '0 0 8px rgba(0,229,255,0.45)' }}
              />
          </div>
        </div>

        {/* Uptime */}
        <div className="text-[#666] text-sm">
          Uptime: <span style={{ fontFamily: 'monospace' }}>{instance.uptime}</span>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-[#2a2a2a] space-y-2">
          {/* Access Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-[#0a0a0a] border-[#2a2a2a] text-[#0066cc] hover:bg-[#0066cc] hover:text-white"
              disabled={instance.status !== "running"}
            >
              <Monitor className="w-4 h-4 mr-2" />
              noVNC
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-[#0a0a0a] border-[#2a2a2a] text-[#00aaff] hover:bg-[#00aaff] hover:text-white"
              disabled={instance.status !== "running"}
            >
              <Chrome className="w-4 h-4 mr-2" />
              Chrome RD
            </Button>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
            {instance.status === "stopped" && (
              <Button 
                size="sm" 
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onStart?.(instance.id)}
              >
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
            {instance.status === "running" && (
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1 bg-[#0a0a0a] border-[#2a2a2a] text-yellow-400 hover:bg-yellow-600 hover:text-white"
                onClick={() => onStop?.(instance.id)}
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white"
              onClick={() => onRestart?.(instance.id)}
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-red-400 hover:bg-red-600 hover:text-white"
              onClick={() => onDelete?.(instance.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
