import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CanvasNode as CanvasNodeType, ServiceSnapshot } from '../types';
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
  HardDrive,
  Search,
  Cloud,
  Gauge,
  GitBranch,
} from 'lucide-react';

const NODE_ICONS: Record<string, React.ReactNode> = {
  producer: <Activity className="w-6 h-6" />,
  kafka: <Grid3X3 className="w-6 h-6" />,
  worker: <Server className="w-6 h-6" />,
  database: <Database className="w-6 h-6" />,
  postgresql: <Database className="w-6 h-6" />,
  mongodb: <HardDrive className="w-6 h-6" />,
  cassandra: <HardDrive className="w-6 h-6" />,
  elasticsearch: <Search className="w-6 h-6" />,
  cache: <Zap className="w-6 h-6" />,
  redis: <Zap className="w-6 h-6" />,
  rabbitmq: <GitBranch className="w-6 h-6" />,
  s3: <Cloud className="w-6 h-6" />,
  rate_limiter: <Gauge className="w-6 h-6" />,
  load_balancer: <Box className="w-6 h-6" />,
  api_gateway: <Shield className="w-6 h-6" />,
  circuit_breaker: <AlertCircle className="w-6 h-6" />,
  dead_letter_queue: <Inbox className="w-6 h-6" />,
  consumer_group: <Users className="w-6 h-6" />,
};

interface CanvasNodeProps {
  node: CanvasNodeType;
  selected: boolean;
  isConnecting: boolean;
  snapshot?: ServiceSnapshot;
  crashed?: boolean;
  latencySpike?: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  onConnectStart: (nodeId: string, isOutput: boolean) => void;
  onMouseUp: (nodeId: string) => void;
}

export function CanvasNode({
  node,
  selected,
  isConnecting,
  snapshot,
  crashed,
  latencySpike,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onConnectStart,
  onMouseUp,
}: CanvasNodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.handle')) return;
    e.stopPropagation();

    // In connection mode, clicking a node should complete the connection,
    // not start dragging that node.
    if (isConnecting) {
      onMouseUp(node.id);
      return;
    }

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    onDragStart();
    onSelect();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      onDrag(dx, dy);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        onDragEnd();
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      // Capture phase ensures drag end is observed even if child handlers stop propagation.
      window.addEventListener('mouseup', handleMouseUp, true);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp, true);
      };
    }
  }, [isDragging, onDrag, onDragEnd]);

  const handleNodeMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) {
      // Ensure drag mode exits even if window-level mouseup misses for any reason.
      setIsDragging(false);
      onDragEnd();
      return;
    }

    onMouseUp(node.id);
  };

  // Calculate health color
  const getHealthColor = () => {
    if (crashed) return '#6B7280'; // gray
    if (!snapshot) return '#3B82F6'; // blue default
    const health = snapshot.healthScore;
    if (health > 0.7) return '#10B981'; // green
    if (health > 0.4) return '#F59E0B'; // yellow
    return '#EF4444'; // red
  };

  const fillOpacity = snapshot ? Math.min(snapshot.queueDepth / 100, 1) * 0.3 : 0.1;

  return (
    <g transform={`translate(${node.x}, ${node.y})`} onMouseUp={handleNodeMouseUp}>
      {/* Latency spike glow */}
      {latencySpike && (
        <motion.circle
          cx="60"
          cy="60"
          r="65"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="3"
          opacity="0.6"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1.1 }}
          transition={{ repeat: Infinity, duration: 1, repeatType: 'reverse' }}
        />
      )}

      {/* Main node circle */}
      <motion.g
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        whileHover={{ scale: 1.05 }}
      >
        <circle
          cx="60"
          cy="60"
          r="50"
          fill={getHealthColor()}
          fillOpacity={fillOpacity}
          stroke={getHealthColor()}
          strokeWidth={selected ? 3 : 2}
          className="transition-all"
        />
        
        {/* Icon */}
        <foreignObject x="35" y="35" width="50" height="50">
          <div className="flex items-center justify-center w-full h-full text-white">
            {NODE_ICONS[node.type]}
          </div>
        </foreignObject>

        {/* Label */}
        <text
          x="60"
          y="130"
          textAnchor="middle"
          className="fill-gray-800 text-sm font-medium pointer-events-none"
        >
          {node.label}
        </text>

        {/* Circuit breaker state badge */}
        {snapshot?.circuitBreakerState && (
          <foreignObject x="85" y="25" width="60" height="20">
            <div className="text-xs font-bold bg-white px-2 py-1 rounded border border-gray-300">
              {snapshot.circuitBreakerState.toUpperCase()}
            </div>
          </foreignObject>
        )}

        {/* Queue depth bar */}
        {snapshot && snapshot.queueDepth > 0 && (
          <rect
            x="15"
            y={110 - Math.min(snapshot.queueDepth, 40)}
            width="10"
            height={Math.min(snapshot.queueDepth, 40)}
            fill="#3B82F6"
            opacity="0.7"
          />
        )}
      </motion.g>

      {/* Input handle */}
      <circle
        cx="10"
        cy="60"
        r="8"
        fill="#10B981"
        stroke="white"
        strokeWidth="2"
        className="handle cursor-crosshair"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isConnecting) {
            onMouseUp(node.id);
          } else {
            onConnectStart(node.id, false);
          }
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
        }}
      />

      {/* Output handle */}
      <circle
        cx="110"
        cy="60"
        r="8"
        fill="#EF4444"
        stroke="white"
        strokeWidth="2"
        className="handle cursor-crosshair"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isConnecting) {
            onMouseUp(node.id);
          } else {
            onConnectStart(node.id, true);
          }
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
        }}
      />
    </g>
  );
}
