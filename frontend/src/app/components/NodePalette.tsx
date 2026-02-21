import { useDrag } from 'react-dnd';
import { NodeType } from '../types';
import {
  Server,
  Database,
  Zap,
  Box,
  Grid3X3,
  Shield,
  AlertCircle,
  Inbox,
  Users,
  Activity,
} from 'lucide-react';

const NODE_CONFIGS: Array<{ type: NodeType; label: string; icon: React.ReactNode }> = [
  { type: 'producer', label: 'Producer', icon: <Activity className="w-5 h-5" /> },
  { type: 'kafka', label: 'Kafka', icon: <Grid3X3 className="w-5 h-5" /> },
  { type: 'worker', label: 'Worker', icon: <Server className="w-5 h-5" /> },
  { type: 'database', label: 'Database', icon: <Database className="w-5 h-5" /> },
  { type: 'cache', label: 'Cache', icon: <Zap className="w-5 h-5" /> },
  { type: 'load_balancer', label: 'Load Balancer', icon: <Box className="w-5 h-5" /> },
  { type: 'api_gateway', label: 'API Gateway', icon: <Shield className="w-5 h-5" /> },
  { type: 'circuit_breaker', label: 'Circuit Breaker', icon: <AlertCircle className="w-5 h-5" /> },
  { type: 'dead_letter_queue', label: 'Dead Letter Queue', icon: <Inbox className="w-5 h-5" /> },
  { type: 'consumer_group', label: 'Consumer Group', icon: <Users className="w-5 h-5" /> },
];

interface DraggableNodeProps {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
}

function DraggableNode({ type, label, icon }: DraggableNodeProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'node',
    item: { nodeType: type },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg cursor-move hover:border-blue-400 hover:shadow-md transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function NodePalette() {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
      <h2 className="font-semibold mb-4">Microservices</h2>
      <div className="space-y-2">
        {NODE_CONFIGS.map((config) => (
          <DraggableNode
            key={config.type}
            type={config.type}
            label={config.label}
            icon={config.icon}
          />
        ))}
      </div>
    </div>
  );
}
