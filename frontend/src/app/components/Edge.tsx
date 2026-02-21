import { motion } from 'motion/react';
import { CanvasNode, EdgeConfig } from '../types';

interface EdgeProps {
  edge: EdgeConfig;
  nodes: CanvasNode[];
  selected: boolean;
  error?: boolean;
  onClick: () => void;
}

export function Edge({ edge, nodes, selected, error, onClick }: EdgeProps) {
  const sourceNode = nodes.find((n) => n.id === edge.sourceId);
  const targetNode = nodes.find((n) => n.id === edge.targetId);

  if (!sourceNode || !targetNode) return null;

  const x1 = sourceNode.x + 110;
  const y1 = sourceNode.y + 60;
  const x2 = targetNode.x + 10;
  const y2 = targetNode.y + 60;

  // Calculate control points for bezier curve
  const dx = x2 - x1;
  const controlX1 = x1 + dx * 0.5;
  const controlX2 = x2 - dx * 0.5;

  const path = `M ${x1} ${y1} C ${controlX1} ${y1}, ${controlX2} ${y2}, ${x2} ${y2}`;

  return (
    <g onClick={onClick}>
      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth="20"
        style={{ cursor: 'pointer' }}
      />
      
      {/* Visible path */}
      <motion.path
        d={path}
        fill="none"
        stroke={error ? '#EF4444' : selected ? '#3B82F6' : '#9CA3AF'}
        strokeWidth={selected ? 3 : 2}
        markerEnd="url(#arrowhead)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Error pulse */}
      {error && (
        <motion.circle
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          r="6"
          fill="#EF4444"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.5, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}
    </g>
  );
}

// Arrow marker definition
export function EdgeMarkers() {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth="10"
        markerHeight="10"
        refX="9"
        refY="3"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L0,6 L9,3 z" fill="#9CA3AF" />
      </marker>
    </defs>
  );
}
