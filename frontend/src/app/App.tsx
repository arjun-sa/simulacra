import { useState, useRef, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable';
import {
  CanvasNode,
  EdgeConfig,
  NodeType,
  TopologyConfig,
  PlaybackState,
  PlaybackSpeed,
  SimEvent,
  SystemSnapshot,
  ServiceSnapshot,
} from './types';
import { NodePalette } from './components/NodePalette';
import { Canvas } from './components/Canvas';
import { NodeConfigPanel } from './components/NodeConfigPanel';
import { PlayerControls } from './components/PlayerControls';
import { EventTimeline } from './components/EventTimeline';
import { MetricsPanel } from './components/MetricsPanel';
import { Toolbar } from './components/Toolbar';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

export default function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<EdgeConfig[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [systemSnapshot, setSystemSnapshot] = useState<SystemSnapshot | null>(null);
  const [crashedNodes, setCrashedNodes] = useState<Set<string>>(new Set());
  const [latencySpikeNodes, setLatencySpikeNodes] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeIdCounter = useRef(0);
  const edgeIdCounter = useRef(0);
  const eventIdCounter = useRef(0);
  const simTimeRef = useRef(0);
  const runIdRef = useRef('run-0');

  // Mock simulation engine - generates random events
  useEffect(() => {
    if (playbackState !== 'playing' || nodes.length === 0) return;

    const interval = setInterval(() => {
      simTimeRef.current += 100 * playbackSpeed;

      // Generate mock events
      if (Math.random() < 0.3 && edges.length > 0) {
        const edge = edges[Math.floor(Math.random() * edges.length)];
        const eventType: SimEvent['type'] = Math.random() < 0.8 ? 'message_sent' : 
          Math.random() < 0.5 ? 'message_error' : 'message_dropped';

        const newEvent: SimEvent = {
          id: `event-${eventIdCounter.current++}`,
          timestamp: simTimeRef.current,
          type: eventType,
          sourceNodeId: edge.sourceId,
          targetNodeId: edge.targetId,
          messageId: `msg-${Math.random().toString(36).substr(2, 9)}`,
          latencyMs: 50 + Math.random() * 200,
          failureInjected: Math.random() < 0.1,
        };

        setEvents((prev) => [...prev, newEvent]);

        // Handle node crashes and latency spikes
        if (Math.random() < 0.05) {
          const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
          if (Math.random() < 0.5) {
            setCrashedNodes((prev) => new Set(prev).add(randomNode.id));
            setEvents((prev) => [
              ...prev,
              {
                id: `event-${eventIdCounter.current++}`,
                timestamp: simTimeRef.current,
                type: 'node_crashed',
                sourceNodeId: randomNode.id,
                messageId: '',
                failureInjected: true,
              },
            ]);
          } else {
            setLatencySpikeNodes((prev) => new Set(prev).add(randomNode.id));
            setEvents((prev) => [
              ...prev,
              {
                id: `event-${eventIdCounter.current++}`,
                timestamp: simTimeRef.current,
                type: 'latency_spike',
                sourceNodeId: randomNode.id,
                messageId: '',
                failureInjected: false,
              },
            ]);
            setTimeout(() => {
              setLatencySpikeNodes((prev) => {
                const next = new Set(prev);
                next.delete(randomNode.id);
                return next;
              });
            }, 2000);
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [playbackState, playbackSpeed, nodes, edges]);

  // Generate mock snapshots every 2 seconds
  useEffect(() => {
    if (playbackState !== 'playing' || nodes.length === 0) return;

    const interval = setInterval(() => {
      const services: Record<string, ServiceSnapshot> = {};
      nodes.forEach((node) => {
        services[node.id] = {
          nodeId: node.id,
          snapshotAt: Date.now(),
          throughputPerSec: 10 + Math.random() * 90,
          avgLatencyMs: 20 + Math.random() * 180,
          p95LatencyMs: 50 + Math.random() * 250,
          errorRate: Math.random() * 0.2,
          queueDepth: Math.floor(Math.random() * 50),
          healthScore: crashedNodes.has(node.id) ? 0 : 0.5 + Math.random() * 0.5,
          circuitBreakerState: node.type === 'circuit_breaker' 
            ? (['closed', 'open', 'half-open'] as const)[Math.floor(Math.random() * 3)]
            : undefined,
        };
      });

      const snapshot: SystemSnapshot = {
        runId: runIdRef.current,
        snapshotAt: Date.now(),
        services,
        totalThroughput: Object.values(services).reduce((sum, s) => sum + s.throughputPerSec, 0),
        bottleneckNodeId: nodes.length > 0 ? nodes[Math.floor(Math.random() * nodes.length)].id : null,
        overallHealthScore: Object.values(services).reduce((sum, s) => sum + s.healthScore, 0) / nodes.length,
      };

      setSystemSnapshot(snapshot);
    }, 2000);

    return () => clearInterval(interval);
  }, [playbackState, nodes, crashedNodes]);

  const handleAddNode = (type: NodeType, x: number, y: number) => {
    const newNode: CanvasNode = {
      id: `node-${nodeIdCounter.current++}`,
      type,
      label: `${type}-${nodeIdCounter.current}`,
      x,
      y,
    };
    setNodes(prev => [...prev, newNode]);
    toast.success(`Added ${type} node`);
  };

  const handleUpdateNode = (id: string, dx: number, dy: number) => {
    setNodes(prev =>
      prev.map((node) =>
        node.id === id ? { ...node, x: node.x + dx, y: node.y + dy } : node
      )
    );
  };

  const handleUpdateNodeConfig = (updates: Partial<CanvasNode>) => {
    if (!selectedNodeId) return;
    setNodes(prev => prev.map((node) => (node.id === selectedNodeId ? { ...node, ...updates } : node)));
  };

  const handleAddEdge = (sourceId: string, targetId: string) => {
    // Prevent self-loops
    if (sourceId === targetId) {
      toast.error('Cannot connect a node to itself');
      return;
    }

    // Check if edge already exists
    const exists = edges.some((e) => e.sourceId === sourceId && e.targetId === targetId);
    if (exists) {
      toast.error('Edge already exists');
      return;
    }

    const newEdge: EdgeConfig = {
      id: `edge-${edgeIdCounter.current++}`,
      sourceId,
      targetId,
    };
    setEdges(prev => [...prev, newEdge]);
    toast.success('Connected nodes');
  };

  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      setNodes(prev => prev.filter((n) => n.id !== selectedNodeId));
      setEdges(prev => prev.filter((e) => e.sourceId !== selectedNodeId && e.targetId !== selectedNodeId));
      setSelectedNodeId(null);
      toast.success('Deleted node');
    } else if (selectedEdgeId) {
      setEdges(prev => prev.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      toast.success('Deleted edge');
    }
  };

  const handleExport = () => {
    const topology: TopologyConfig = {
      nodes: nodes.map(({ x, y, ...node }) => node),
      edges,
    };
    const json = JSON.stringify(topology, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'topology.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported topology');
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const topology = JSON.parse(event.target?.result as string) as TopologyConfig;
        
        // Convert to canvas nodes with positions
        const canvasNodes: CanvasNode[] = topology.nodes.map((node, i) => ({
          ...node,
          x: 100 + (i % 5) * 200,
          y: 100 + Math.floor(i / 5) * 200,
        }));

        setNodes(canvasNodes);
        setEdges(topology.edges);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        
        // Update counters
        nodeIdCounter.current = Math.max(
          ...canvasNodes.map((n) => parseInt(n.id.split('-')[1]) || 0),
          0
        ) + 1;
        edgeIdCounter.current = Math.max(
          ...topology.edges.map((e) => parseInt(e.id.split('-')[1]) || 0),
          0
        ) + 1;

        toast.success('Imported topology');
      } catch (error) {
        toast.error('Failed to import: Invalid JSON');
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  };

  const handleClear = () => {
    if (nodes.length === 0 && edges.length === 0) return;
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEvents([]);
    setSystemSnapshot(null);
    setCrashedNodes(new Set());
    setLatencySpikeNodes(new Set());
    toast.success('Cleared canvas');
  };

  const handleStart = () => {
    if (nodes.length === 0) {
      toast.error('Add some nodes first');
      return;
    }
    setPlaybackState('playing');
    runIdRef.current = `run-${Date.now()}`;
    simTimeRef.current = 0;
    setEvents([]);
    setCrashedNodes(new Set());
    setLatencySpikeNodes(new Set());
    toast.success('Simulation started');
  };

  const handlePause = () => {
    setPlaybackState('paused');
    toast.info('Simulation paused');
  };

  const handleResume = () => {
    setPlaybackState('playing');
    toast.success('Simulation resumed');
  };

  const handleReset = () => {
    setPlaybackState('idle');
    setEvents([]);
    setSystemSnapshot(null);
    setCrashedNodes(new Set());
    setLatencySpikeNodes(new Set());
    simTimeRef.current = 0;
    toast.info('Simulation reset');
  };

  const handleTick = () => {
    // Single step simulation - generate one event
    if (edges.length > 0) {
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const newEvent: SimEvent = {
        id: `event-${eventIdCounter.current++}`,
        timestamp: simTimeRef.current,
        type: 'message_sent',
        sourceNodeId: edge.sourceId,
        targetNodeId: edge.targetId,
        messageId: `msg-${Math.random().toString(36).substr(2, 9)}`,
        latencyMs: 100,
        failureInjected: false,
      };
      setEvents((prev) => [...prev, newEvent]);
      simTimeRef.current += 100;
      toast.info('Ticked simulation');
    }
  };

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null;
  const snapshots = systemSnapshot?.services || {};

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-gray-100">
        <Toolbar onExport={handleExport} onImport={handleImport} onClear={handleClear} />
        
        <PlayerControls
          state={playbackState}
          speed={playbackSpeed}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onReset={handleReset}
          onTick={handleTick}
          onSpeedChange={setPlaybackSpeed}
        />

        <ResizablePanelGroup direction="vertical" className="flex-1">
          <ResizablePanel defaultSize={15} minSize={10}>
            <MetricsPanel snapshot={systemSnapshot} />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="flex h-full overflow-hidden">
              <NodePalette />
              
              <Canvas
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                snapshots={snapshots}
                events={events}
                crashedNodes={crashedNodes}
                latencySpikeNodes={latencySpikeNodes}
                playbackSpeed={playbackSpeed}
                onAddNode={handleAddNode}
                onUpdateNode={handleUpdateNode}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
                onAddEdge={handleAddEdge}
                onDeleteSelected={handleDeleteSelected}
              />
              
              <NodeConfigPanel
                node={selectedNode}
                onUpdate={handleUpdateNodeConfig}
                onClose={() => setSelectedNodeId(null)}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={15} minSize={10}>
            <EventTimeline events={events} />
          </ResizablePanel>
        </ResizablePanelGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        <Toaster />
      </div>
    </DndProvider>
  );
}
