import { Button } from './ui/button';
import { Download, Upload, Trash2, PanelTop, PanelLeft } from 'lucide-react';

interface ToolbarProps {
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onToggleMetrics: () => void;
  onToggleMicroservices: () => void;
  metricsCollapsed: boolean;
  microservicesCollapsed: boolean;
}

export function Toolbar({
  onExport,
  onImport,
  onClear,
  onToggleMetrics,
  onToggleMicroservices,
  metricsCollapsed,
  microservicesCollapsed,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
      <h1 className="text-xl font-bold mr-4">Simulacra</h1>

      <Button variant="outline" size="sm" onClick={onImport}>
        <Upload className="w-4 h-4 mr-2" />
        Import
      </Button>

      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="w-4 h-4 mr-2" />
        Export
      </Button>

      <Button variant="outline" size="sm" onClick={onClear}>
        <Trash2 className="w-4 h-4 mr-2" />
        Clear All
      </Button>

      <Button variant="outline" size="sm" onClick={onToggleMetrics}>
        <PanelTop className="w-4 h-4 mr-2" />
        {metricsCollapsed ? 'Expand Metrics' : 'Collapse Metrics'}
      </Button>

      <Button variant="outline" size="sm" onClick={onToggleMicroservices}>
        <PanelLeft className="w-4 h-4 mr-2" />
        {microservicesCollapsed ? 'Expand Microservices' : 'Collapse Microservices'}
      </Button>
    </div>
  );
}
