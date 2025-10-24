import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { DashboardView } from "./components/DashboardView";
import { InstancesView } from "./components/InstancesView";
import { MonitoringView } from "./components/MonitoringView";
import { SettingsView } from "./components/SettingsView";
import { InstanceModal, InstanceConfig } from "./components/InstanceModal";
import { Instance } from "./components/InstanceCard";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner@2.0.3";

// Sample instance data
// API base (configurable via Vite env VITE_API_BASE)
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

const initialInstances: Instance[] = [];

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [instances, setInstances] = useState<Instance[]>(initialInstances);
  const [modalOpen, setModalOpen] = useState(false);

  // Convert backend shape to frontend Instance
  const mapBackend = (b: any): Instance => {
    const status = (b.state === 'running' || (b.status && /Up/.test(b.status))) ? 'running' : (b.state === 'exited' || (b.status && /Exited/.test(b.status)) ? 'stopped' : 'error');
    return {
      id: b.id || b["rdp.instanceId"] || (b.containerId ? b.containerId : ''),
      name: b.name || b["rdp.name"] || b.containerId || 'unknown',
      status,
      image: b.image || b.Image || '',
      cpuUsage: typeof b.cpuUsage === 'number' ? b.cpuUsage : 0,
      ramUsage: typeof b.ramUsage === 'number' ? b.ramUsage : (b.ramMb || 0),
      ramTotal: typeof b.ramTotal === 'number' ? b.ramTotal : (b.ramMb || 0),
      uptime: b.uptime || '',
      novncUrl: b.novncUrl || '',
      chromeRdUrl: b.chromeRdUrl || '',
    };
  };

  // Load instances from backend
  useEffect(() => {
    let mounted = true;
    let iv: any = null;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/instances`);
        if (!res.ok) return;
        const list = await res.json();
        if (!mounted) return;
        setInstances(list.map(mapBackend));
      } catch (e) {
        console.warn('Failed to load instances', e);
      }
    };
    load();
    iv = setInterval(load, 3000);
    return () => { mounted = false; if (iv) clearInterval(iv); };
  }, []);

  const viewTitles: Record<string, string> = {
    dashboard: "Dashboard Overview",
    instances: "Instance Management",
    monitoring: "System Monitoring",
    settings: "Platform Settings",
  };

  const handleCreateInstance = async (config: InstanceConfig) => {
    try {
      const count = (config as any).count && Number((config as any).count) > 1 ? Number((config as any).count) : 1;
      const createdInstances: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const name = count > 1 ? `${config.name}-${i + 1}` : config.name;
        const body: any = { image: config.image, cpu: config.cpuCores, ramMb: config.ramMB, name };
        if ((config as any).crd) body.crd = (config as any).crd;
        const res = await fetch(`${API_BASE}/instances`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`create failed: ${res.status}`);
        const created = await res.json();
        createdInstances.push(mapBackend(created));
      }
      setInstances((s) => [...s, ...createdInstances]);
      toast.success(`Created ${createdInstances.length} instance(s)`, { description: 'Containers are provisioning and starting up' });
    } catch (e) {
      console.error('create instance failed', e);
      toast.error('Failed to create instance');
    }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/instances/${id}/start`, { method: 'POST' });
      if (!res.ok) throw new Error('start failed');
      setInstances((s) => s.map((inst) => inst.id === id ? { ...inst, status: 'running' } : inst));
      const instance = instances.find((i) => i.id === id);
      toast.success(`Started instance "${instance?.name}"`, { description: 'Container is now running' });
    } catch (e) {
      toast.error('Failed to start instance');
    }
  };

  const handleStop = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/instances/${id}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error('stop failed');
      setInstances((s) => s.map((inst) => inst.id === id ? { ...inst, status: 'stopped', cpuUsage: 0, ramUsage: 0 } : inst));
      const instance = instances.find((i) => i.id === id);
      toast.info(`Stopped instance "${instance?.name}"`, { description: 'Container has been stopped' });
    } catch (e) {
      toast.error('Failed to stop instance');
    }
  };

  const handleRestart = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/instances/${id}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('restart failed');
      toast.info('Restarted instance', { description: 'Container has been restarted' });
    } catch (e) {
      toast.error('Failed to restart instance');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      const instance = instances.find((i) => i.id === id);
      setInstances((s) => s.filter((inst) => inst.id !== id));
      toast.error(`Deleted instance "${instance?.name}"`, { description: 'Container has been removed' });
    } catch (e) {
      toast.error('Failed to delete instance');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onCreateInstance={() => setModalOpen(true)}
      />
      
      <div className="flex-1 flex flex-col">
        <Header viewTitle={viewTitles[activeView]} />
        
        <main className="flex-1 overflow-auto p-8">
          {activeView === "dashboard" && (
            <DashboardView
              instances={instances}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onDelete={handleDelete}
            />
          )}
          
          {activeView === "instances" && (
            <InstancesView
              instances={instances}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onDelete={handleDelete}
            />
          )}
          
          {activeView === "monitoring" && <MonitoringView />}
          
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>

      <InstanceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateInstance}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#141414",
            border: "1px solid #2a2a2a",
            color: "#ffffff",
          },
        }}
      />
    </div>
  );
}
