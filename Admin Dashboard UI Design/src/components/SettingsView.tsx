import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { Settings, Save } from "lucide-react";

export function SettingsView() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Platform Configuration */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-[#0066cc]" />
          <h3 className="text-white">Platform Configuration</h3>
        </div>

        <div className="space-y-6">
          {/* Docker Host */}
          <div className="space-y-2">
            <Label className="text-white">Docker Host</Label>
            <Input
              defaultValue="unix:///var/run/docker.sock"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Docker daemon socket or TCP address</p>
          </div>

          {/* Default CPU Limit */}
          <div className="space-y-2">
            <Label className="text-white">Default CPU Limit (cores)</Label>
            <Input
              type="number"
              defaultValue="4"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Default CPU allocation for new instances</p>
          </div>

          {/* Default RAM Limit */}
          <div className="space-y-2">
            <Label className="text-white">Default RAM Limit (MB)</Label>
            <Input
              type="number"
              defaultValue="8192"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Default memory allocation for new instances</p>
          </div>
        </div>
      </Card>

      {/* Traefik Configuration */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-6">Traefik Load Balancer</h3>

        <div className="space-y-6">
          {/* Base Domain */}
          <div className="space-y-2">
            <Label className="text-white">Base Domain</Label>
            <Input
              defaultValue="roboticslab.local"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Base domain for instance routing</p>
          </div>

          {/* Traefik Dashboard */}
          <div className="space-y-2">
            <Label className="text-white">Traefik Dashboard URL</Label>
            <Input
              defaultValue="http://localhost:8888/dashboard/"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Access URL for Traefik admin interface</p>
          </div>

          {/* Auto SSL */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Automatic SSL Certificates</Label>
              <p className="text-[#666] text-xs mt-1">Enable Let's Encrypt SSL provisioning</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* Monitoring Settings */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-6">Monitoring Settings</h3>

        <div className="space-y-6">
          {/* cAdvisor Endpoint */}
          <div className="space-y-2">
            <Label className="text-white">cAdvisor Endpoint</Label>
            <Input
              defaultValue="http://localhost:8080"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">Container monitoring service endpoint</p>
          </div>

          {/* Metrics Retention */}
          <div className="space-y-2">
            <Label className="text-white">Metrics Retention (days)</Label>
            <Input
              type="number"
              defaultValue="30"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              style={{ fontFamily: 'monospace' }}
            />
            <p className="text-[#666] text-xs">How long to keep historical metrics data</p>
          </div>

          {/* Enable Alerts */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Resource Usage Alerts</Label>
              <p className="text-[#666] text-xs mt-1">Send notifications for high resource usage</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* Remote Desktop Settings */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-6">Remote Desktop Settings</h3>

        <div className="space-y-6">
          {/* noVNC Port Range */}
          <div className="space-y-2">
            <Label className="text-white">noVNC Port Range</Label>
            <div className="flex gap-3">
              <Input
                placeholder="6080"
                defaultValue="6080"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
                style={{ fontFamily: 'monospace' }}
              />
              <span className="text-[#666] flex items-center">to</span>
              <Input
                placeholder="6180"
                defaultValue="6180"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <p className="text-[#666] text-xs">Port range for noVNC connections</p>
          </div>

          {/* Chrome RD */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Enable Chrome Remote Desktop</Label>
              <p className="text-[#666] text-xs mt-1">Allow Chrome RD access for all instances</p>
            </div>
            <Switch defaultChecked />
          </div>

          {/* VNC Password Protection */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Require VNC Password</Label>
              <p className="text-[#666] text-xs mt-1">Enforce password authentication for VNC access</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* User Preferences */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-6">User Preferences</h3>

        <div className="space-y-6">
          {/* Theme */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Dark Theme</Label>
              <p className="text-[#666] text-xs mt-1">Use dark color scheme</p>
            </div>
            <Switch defaultChecked />
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Desktop Notifications</Label>
              <p className="text-[#666] text-xs mt-1">Show browser notifications for instance events</p>
            </div>
            <Switch defaultChecked />
          </div>

          {/* Auto-refresh */}
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-white">Auto-refresh Dashboard</Label>
              <p className="text-[#666] text-xs mt-1">Automatically update instance status every 5 seconds</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="bg-[#0066cc] hover:bg-[#0052a3] text-white">
          <Save className="w-4 h-4 mr-2" />
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
