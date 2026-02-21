import { motion } from 'motion/react';
import { CanvasNode, SimEvent } from '../types';

interface MessageParticleProps {
  event: SimEvent;
  nodes: CanvasNode[];
  speed: number;
}

export function MessageParticle({ event, nodes, speed }: MessageParticleProps) {
  const sourceNode = nodes.find((n) => n.id === event.sourceNodeId);
  const targetNode = event.targetNodeId ? nodes.find((n) => n.id === event.targetNodeId) : null;

  if (!sourceNode || !targetNode) return null;

  const x1 = sourceNode.x + 110;
  const y1 = sourceNode.y + 60;
  const x2 = targetNode.x + 10;
  const y2 = targetNode.y + 60;

  const duration = (event.latencyMs || 100) / 1000 / speed;

  const getParticleColor = () => {
    switch (event.type) {
      case 'message_error':
        return '#EF4444';
      case 'message_dropped':
        return '#F59E0B';
      default:
        return '#3B82F6';
    }
  };

  return (
    <motion.circle
      cx={x1}
      cy={y1}
      r="5"
      fill={getParticleColor()}
      initial={{ cx: x1, cy: y1, opacity: 1 }}
      animate={{
        cx: event.type === 'message_dropped' ? (x1 + x2) / 2 : x2,
        cy: event.type === 'message_dropped' ? (y1 + y2) / 2 : y2,
        opacity: event.type === 'message_dropped' ? 0 : 1,
      }}
      transition={{ duration, ease: 'linear' }}
    />
  );
}
