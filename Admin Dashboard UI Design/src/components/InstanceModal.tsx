import { useState, useEffect } from "react";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { Server } from "lucide-react";

interface InstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (config: InstanceConfig) => void;
}

export interface InstanceConfig {
  name: string;
  image: string;
  cpuCores: number;
  ramMB: number;
  count?: number;
  crd?: { email?: string; code?: string; password?: string } | undefined;
}

export function InstanceModal({ open, onClose, onCreate }: InstanceModalProps) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [cpuCores, setCpuCores] = useState([4]);
  const [ramMB, setRamMB] = useState([8192]);
  const [count, setCount] = useState([1]);
  const [customImage, setCustomImage] = useState("");
  const [availableImages, setAvailableImages] = useState<{ tag: string }[]>([]);

  // CRD fields
  const [useCRD, setUseCRD] = useState(false);
  const [crdEmail, setCrdEmail] = useState("");
  const [crdCode, setCrdCode] = useState("");
  const [crdPassword, setCrdPassword] = useState("");

  const roboticsImages = [
    { value: "ros2-humble", label: "ROS2 Humble Desktop" },
    { value: "ros-noetic", label: "ROS Noetic Desktop Full" },
    { value: "gazebo-classic", label: "Gazebo Classic 11" },
    { value: "gazebo-ignition", label: "Gazebo Ignition Fortress" },
    { value: "px4-sitl", label: "PX4 SITL Simulation" },
    { value: "ardupilot-sitl", label: "ArduPilot SITL" },
    { value: "moveit2", label: "MoveIt2 Motion Planning" },
    { value: "nav2-stack", label: "ROS2 Navigation Stack" },
    { value: "turtlebot3", label: "TurtleBot3 Simulation" },
    { value: "autoware", label: "Autoware Autonomous Driving" },
  ];

  const handleCreate = () => {
    if (!name || !image) return;
    const crd = useCRD ? { email: crdEmail, code: crdCode, password: crdPassword } : undefined;
    const finalImage = (customImage || '').trim() || image;
    onCreate({
      name,
      image: finalImage,
      cpuCores: cpuCores[0],
      ramMB: ramMB[0],
      count: count[0],
      crd,
    } as InstanceConfig);

    // Reset form
    setName("");
    setImage("");
    setCpuCores([4]);
    setRamMB([8192]);
    onClose();
  };

  useEffect(() => {
    let mounted = true;
    if (!open) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/images`);
        if (!res.ok) return;
        const list = await res.json();
        if (!mounted) return;
        setAvailableImages(list || []);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#141414] border-[#2a2a2a] text-white sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Server className="w-5 h-5 text-[#0066cc]" />
            Create New Instance
          </DialogTitle>
          <DialogDescription className="text-[#999]">
            Configure and provision a new robotics simulation container
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Instance Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">Instance Name</Label>
            <Input
              id="name"
              placeholder="e.g., ROS2-Nav-Stack-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">A unique identifier for this container instance</p>
          </div>

          {/* Docker Image Selection */}
          <div className="space-y-2">
            <Label htmlFor="image" className="text-white">Docker Image</Label>
            <Select value={image} onValueChange={setImage}>
              <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white" style={{ fontFamily: 'monospace' }}>
                <SelectValue placeholder="Select a robotics image..." />
              </SelectTrigger>
              <SelectContent className="bg-[#141414] border-[#2a2a2a]">
                {availableImages.length ? (
                  availableImages.map((img) => (
                    <SelectItem key={img.tag} value={img.tag} className="text-white focus:bg-[#0066cc] focus:text-white" style={{ fontFamily: 'monospace' }}>
                      {img.tag}
                    </SelectItem>
                  ))
                ) : (
                  roboticsImages.map((img) => (
                    <SelectItem 
                      key={img.value} 
                      value={img.value}
                      className="text-white focus:bg-[#0066cc] focus:text-white"
                      style={{ fontFamily: 'monospace' }}
                    >
                      {img.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[#666] text-xs">Pre-configured robotics development environment</p>
            <div className="mt-2">
              <Label className="text-white">Or enter a custom image</Label>
              <Input placeholder="e.g., myrepo/my-image:latest" value={customImage} onChange={(e) => setCustomImage(e.target.value)} className="bg-[#0a0a0a] border-[#2a2a2a] text-white mt-1" />
              <p className="text-[#666] text-xs">If provided, this will override the dropdown selection</p>
            </div>
          </div>

          {/* CRD option */}
          <div className="space-y-2">
            <Label className="text-white">Chrome Remote Desktop</Label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={useCRD} onChange={(e) => setUseCRD(e.target.checked)} />
              <span className="text-[#999] text-sm">Enable CRD registration for this instance</span>
            </div>
            {useCRD && (
              <div className="space-y-2 mt-2">
                <Input placeholder="CRD account email" value={crdEmail} onChange={(e) => setCrdEmail(e.target.value)} className="bg-[#0a0a0a] border-[#2a2a2a] text-white" />
                <Input placeholder="CRD auth code" value={crdCode} onChange={(e) => setCrdCode(e.target.value)} className="bg-[#0a0a0a] border-[#2a2a2a] text-white" />
                <Input placeholder="Numeric PIN (4-6 digits)" value={crdPassword} onChange={(e) => setCrdPassword(e.target.value)} className="bg-[#0a0a0a] border-[#2a2a2a] text-white" />
              </div>
            )}
          </div>

          {/* CPU Allocation */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-white">CPU Cores</Label>
              <span className="text-[#0066cc]" style={{ fontFamily: 'monospace' }}>
                {cpuCores[0]} cores
              </span>
            </div>
            <Slider
              value={cpuCores}
              onValueChange={setCpuCores}
              min={1}
              max={16}
              step={1}
              className="[&_.bg-primary]:bg-[#0066cc]"
            />
            <div className="flex justify-between text-xs text-[#666]">
              <span>1 core</span>
              <span>16 cores</span>
            </div>
          </div>

          {/* RAM Allocation */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-white">RAM Allocation</Label>
              <span className="text-[#0066cc]" style={{ fontFamily: 'monospace' }}>
                {ramMB[0]} MB ({(ramMB[0] / 1024).toFixed(1)} GB)
              </span>
            </div>
            <Slider
              value={ramMB}
              onValueChange={setRamMB}
              min={2048}
              max={32768}
              step={1024}
              className="[&_.bg-primary]:bg-[#0066cc]"
            />
            <div className="flex justify-between text-xs text-[#666]">
              <span>2 GB</span>
              <span>32 GB</span>
            </div>
          </div>

          {/* Traefik Info */}
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 animate-pulse" />
              <div>
                <p className="text-white text-sm">Traefik Load Balancer</p>
                <p className="text-[#666] text-xs mt-1">
                  Automatic routing and SSL configuration will be applied
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Count */}
        <div className="p-4 border-t border-[#2a2a2a]">
          <div className="flex justify-between items-center mb-2">
            <Label className="text-white">Instances to create</Label>
            <span className="text-[#0066cc]" style={{ fontFamily: 'monospace' }}>{count[0]} copies</span>
          </div>
          <Slider value={count} onValueChange={setCount} min={1} max={10} step={1} className="w-full" />
          <p className="text-[#666] text-xs mt-2">Create multiple instances (names will be suffixed with -1, -2, ...)</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-[#2a2a2a]">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name || !(customImage.trim() || image)}
            className="bg-[#0066cc] hover:bg-[#0052a3] text-white"
          >
            Create Instance
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
