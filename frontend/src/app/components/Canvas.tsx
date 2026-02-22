import { useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import { CanvasNode as CanvasNodeType, EdgeConfig, NodeType, ServiceSnapshot, SimEvent } from '../types';
import { CanvasNode } from './CanvasNode';
import { Edge, EdgeMarkers } from './Edge';
import { MessageParticle } from './MessageParticle';

interface CanvasProps {
  nodes: CanvasNodeType[];
  edges: EdgeConfig[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  snapshots: Record<string, ServiceSnapshot>;
  events: SimEvent[];
  crashedNodes: Set<string>;
  latencySpikeNodes: Set<string>;
  playbackSpeed: number;
  onAddNode: (type: NodeType, x: number, y: number) => void;
  onUpdateNode: (id: string, dx: number, dy: number) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onAddEdge: (sourceId: string, targetId: string) => void;
  onDeleteSelected: () => void;
}

export function Canvas({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  snapshots,
  events,
  crashedNodes,
  latencySpikeNodes,
  playbackSpeed,
  onAddNode,
  onUpdateNode,
  onSelectNode,
  onSelectEdge,
  onAddEdge,
  onDeleteSelected,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; isOutput: boolean } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const didPanRef = useRef(false);

  const getWorldPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left - pan.x,
      y: clientY - rect.top - pan.y,
    };
  };

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'node',
    drop: (item: { nodeType: NodeType }, monitor) => {
      const offset = monitor.getClientOffset();
      if (offset) {
        const worldPoint = getWorldPoint(offset.x, offset.y);
        const x = worldPoint.x - 60; // Center on cursor
        const y = worldPoint.y - 60;
        onAddNode(item.nodeType, x, y);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        didPanRef.current = true;
      }
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    if (!connectingFrom) return;
    const worldPoint = getWorldPoint(e.clientX, e.clientY);
    setMousePos(worldPoint);
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    const isBackgroundTarget =
      e.target === e.currentTarget || target.getAttribute('data-canvas-background') === 'true';
    if (e.button !== 0 || !isBackgroundTarget || connectingFrom) return;
    setIsPanning(true);
    didPanRef.current = false;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    const target = e.target as SVGElement;
    const isBackgroundTarget =
      e.target === e.currentTarget || target.getAttribute('data-canvas-background') === 'true';

    // Only cancel connection when mouse is released on the empty canvas.
    if (isBackgroundTarget) {
      setConnectingFrom(null);
    }
  };

  const handleConnectStart = (nodeId: string, isOutput: boolean) => {
    // Clicking the same handle again exits connect mode.
    if (connectingFrom?.nodeId === nodeId && connectingFrom.isOutput === isOutput) {
      setConnectingFrom(null);
      return;
    }
    setConnectingFrom({ nodeId, isOutput });
  };

  const handleNodeMouseUp = (nodeId: string) => {
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      if (connectingFrom.isOutput) {
        // Connecting from output to input
        onAddEdge(connectingFrom.nodeId, nodeId);
      } else {
        // Connecting from input to output (reverse)
        onAddEdge(nodeId, connectingFrom.nodeId);
      }
      setConnectingFrom(null);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    if (!connectingFrom) {
      onSelectNode(nodeId);
      onSelectEdge(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }

    const target = e.target as SVGElement;
    const isBackgroundTarget =
      e.target === svgRef.current || target.getAttribute('data-canvas-background') === 'true';

    if (isBackgroundTarget) {
      onSelectNode(null);
      onSelectEdge(null);
      setConnectingFrom(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedNodeId || selectedEdgeId)) {
      e.preventDefault();
      onDeleteSelected();
    }
  };

  // Get recent message events for animation
  const latestEventTimestamp = events.length > 0 ? events[events.length - 1].timestamp : 0;
  const recentMessageEvents = events.filter((event) => {
    if (
      event.type !== 'message_sent' &&
      event.type !== 'message_received' &&
      event.type !== 'message_dropped'
    ) {
      return false;
    }

    // Show events from the last 5 seconds of simulation time.
    return event.timestamp >= latestEventTimestamp - 5000;
  });

  const getEdgeError = (edgeId: string) => {
    return events.some(
      (e) =>
        e.type === 'message_error' &&
        edges.find((edge) => edge.id === edgeId && edge.sourceId === e.sourceNodeId && edge.targetId === e.targetNodeId)
    );
  };

  return (
    <div
      ref={drop}
      className={`flex-1 relative bg-gray-100 overflow-hidden ${isOver ? 'bg-blue-50' : ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <svg
        ref={svgRef}
        className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onClick={handleCanvasClick}
      >
        <EdgeMarkers />

        {/* Grid pattern */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y})`}>
          <rect
            x="-10000"
            y="-10000"
            width="20000"
            height="20000"
            fill="url(#grid)"
            data-canvas-background="true"
          />

          {/* Edges */}
          {edges.map((edge) => (
            <Edge
              key={edge.id}
              edge={edge}
              nodes={nodes}
              selected={edge.id === selectedEdgeId}
              error={getEdgeError(edge.id)}
              onClick={() => {
                onSelectEdge(edge.id);
                onSelectNode(null);
              }}
            />
          ))}

          {/* Temporary connection line */}
          {connectingFrom && (
            <line
              x1={
                nodes.find((n) => n.id === connectingFrom.nodeId)
                  ? nodes.find((n) => n.id === connectingFrom.nodeId)!.x + (connectingFrom.isOutput ? 110 : 10)
                  : 0
              }
              y1={
                nodes.find((n) => n.id === connectingFrom.nodeId)
                  ? nodes.find((n) => n.id === connectingFrom.nodeId)!.y + 60
                  : 0
              }
              x2={mousePos.x}
              y2={mousePos.y}
              stroke="#3B82F6"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}

          {/* Message particles */}
          {recentMessageEvents.map((event) => (
            <MessageParticle key={event.id} event={event} nodes={nodes} speed={playbackSpeed} />
          ))}

          {/* Nodes */}
          {nodes.map((node) => (
            <CanvasNode
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              isConnecting={Boolean(connectingFrom)}
              snapshot={snapshots[node.id]}
              crashed={crashedNodes.has(node.id)}
              latencySpike={latencySpikeNodes.has(node.id)}
              onSelect={() => handleNodeClick(node.id)}
              onDragStart={() => {}}
              onDrag={(dx, dy) => onUpdateNode(node.id, dx, dy)}
              onDragEnd={() => {}}
              onConnectStart={handleConnectStart}
              onMouseUp={handleNodeMouseUp}
            />
          ))}
        </g>
      </svg>

      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-blue-600 font-semibold text-lg">Drop to add node</div>
        </div>
      )}
    </div>
  );
}
