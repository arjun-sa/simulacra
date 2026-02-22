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
} from './types';
import { NodePalette } from './components/NodePalette';
import { Canvas } from './components/Canvas';
import { NodeConfigPanel } from './components/NodeConfigPanel';
import { PlayerControls } from './components/PlayerControls';
import { MetricsPanel } from './components/MetricsPanel';
import { Toolbar } from './components/Toolbar';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { SimulationEngine } from '../simulation/engine/SimulationEngine';
import { DEFAULT_SYSTEM_NODES, DEFAULT_SYSTEM_EDGES } from './defaultSystem';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'http://localhost:3001';

type BackendServiceSnapshot = {
  nodeId: string;
  nodeType: NodeType;
  throughputPerSec: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  queueDepth: number;
  healthScore: number;
  status: 'healthy' | 'degraded' | 'crashed';
};

type BackendSystemSnapshot = {
  runId: string;
  timestamp: number;
  services: Record<string, BackendServiceSnapshot>;
  system: {
    totalThroughput: number;
    overallHealthScore: number;
    bottleneckService: string | null;
  };
};

const cloneDefaultNodes = () => DEFAULT_SYSTEM_NODES.map((node) => ({ ...node }));
const cloneDefaultEdges = () => DEFAULT_SYSTEM_EDGES.map((edge) => ({ ...edge }));

const getNextCounterValue = (ids: string[], prefix: string) =>
  Math.max(
    ...ids.map((id) => {
      const numeric = Number.parseInt(id.replace(`${prefix}-`, ''), 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    }),
    0
  ) + 1;

export default function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>(() => cloneDefaultNodes());
  const [edges, setEdges] = useState<EdgeConfig[]>(() => cloneDefaultEdges());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [systemSnapshot, setSystemSnapshot] = useState<SystemSnapshot | null>(null);
  const [crashedNodes, setCrashedNodes] = useState<Set<string>>(new Set());
  const [latencySpikeNodes, setLatencySpikeNodes] = useState<Set<string>>(new Set());
  const [metricsCollapsed, setMetricsCollapsed] = useState(false);
  const [microservicesCollapsed, setMicroservicesCollapsed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const nodeIdCounter = useRef(getNextCounterValue(DEFAULT_SYSTEM_NODES.map((node) => node.id), 'node'));
  const edgeIdCounter = useRef(getNextCounterValue(DEFAULT_SYSTEM_EDGES.map((edge) => edge.id), 'edge'));

  const postJson = async (path: string, payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${path} failed (${response.status}): ${text}`);
    }
  };

  const toStatus = (healthScore: number): 'healthy' | 'degraded' | 'crashed' => {
    if (healthScore <= 0.25) return 'crashed';
    if (healthScore <= 0.7) return 'degraded';
    return 'healthy';
  };

  const toBackendSnapshot = (
    snapshot: SystemSnapshot,
    nodeTypeMap: Map<string, NodeType>
  ): BackendSystemSnapshot => {
    const services = Object.entries(snapshot.services).reduce<Record<string, BackendServiceSnapshot>>(
      (acc, [nodeId, service]) => {
        const nodeType = nodeTypeMap.get(nodeId) ?? 'worker';
        acc[nodeId] = {
          nodeId: service.nodeId,
          nodeType,
          throughputPerSec: service.throughputPerSec,
          avgLatencyMs: service.avgLatencyMs,
          p95LatencyMs: service.p95LatencyMs,
          errorRate: service.errorRate,
          queueDepth: Math.max(0, Math.round(service.queueDepth)),
          healthScore: service.healthScore,
          status: toStatus(service.healthScore),
        };
        return acc;
      },
      {}
    );

    return {
      runId: snapshot.runId,
      timestamp: snapshot.snapshotAt,
      services,
      system: {
        totalThroughput: snapshot.totalThroughput,
        overallHealthScore: snapshot.overallHealthScore,
        bottleneckService: snapshot.bottleneckNodeId,
      },
    };
  };

  const endActiveRun = () => {
    const runId = activeRunIdRef.current;
    if (!runId) return;
    activeRunIdRef.current = null;
    void postJson('/runs/end', { runId }).catch((error) => {
      console.error('Failed to end run', error);
    });
  };

  useEffect(() => {
    if (!engineRef.current || playbackState !== 'playing') {
      return;
    }

    const interval = setInterval(() => {
      const engine = engineRef.current;
      if (engine) {
        setEvents([...engine.getEvents()]);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [playbackState]);

  useEffect(() => {
    engineRef.current?.setSpeed(playbackSpeed);
  }, [playbackSpeed]);

  useEffect(() => {
    const crashed = new Set<string>();
    const latency = new Set<string>();
    const latestTimestamp = events.length > 0 ? events[events.length - 1].timestamp : 0;
    const spikeWindowStart = latestTimestamp - 2_000;

    for (const event of events) {
      if (event.type === 'node_crashed') {
        crashed.add(event.sourceNodeId);
      } else if (event.type === 'node_recovered') {
        crashed.delete(event.sourceNodeId);
      } else if (event.type === 'latency_spike' && event.timestamp >= spikeWindowStart) {
        latency.add(event.sourceNodeId);
      }
    }

    setCrashedNodes(crashed);
    setLatencySpikeNodes(latency);
  }, [events]);

  useEffect(() => {
    return () => {
      endActiveRun();
      engineRef.current?.reset();
      engineRef.current = null;
    };
  }, []);

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
        nodeIdCounter.current = getNextCounterValue(canvasNodes.map((node) => node.id), 'node');
        edgeIdCounter.current = getNextCounterValue(topology.edges.map((edge) => edge.id), 'edge');

        toast.success('Imported topology');
      } catch (error) {
        toast.error('Failed to import: Invalid JSON');
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  };

  const buildTopology = (): TopologyConfig => ({
    nodes: nodes.map(({ x, y, ...node }) => node),
    edges,
  });

  const buildEngine = () => {
    const topology = buildTopology();
    const nodeTypeMap = new Map(topology.nodes.map((node) => [node.id, node.type] as const));
    const engine = new SimulationEngine(topology);
    engine.onSnapshot((snapshot) => {
      setSystemSnapshot(snapshot);
      setEvents([...engine.getEvents()]);
      const payload = toBackendSnapshot(snapshot, nodeTypeMap);
      void postJson('/metrics/snapshot', payload).catch((error) => {
        console.error('Failed to push snapshot', error);
      });
    });
    engine.setSpeed(playbackSpeed);
    engineRef.current = engine;
    return engine;
  };

  const handleClear = () => {
    if (nodes.length === 0 && edges.length === 0) return;
    endActiveRun();
    engineRef.current?.reset();
    engineRef.current = null;
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

    endActiveRun();
    engineRef.current?.reset();
    const engine = buildEngine();
    engine.start();
    setSystemSnapshot(engine.getSnapshot());
    setEvents([...engine.getEvents()]);
    activeRunIdRef.current = engine.getRunId();
    void postJson('/runs/start', {
      runId: engine.getRunId(),
      topologyName: 'Canvas Topology',
      nodeCount: nodes.length,
    }).catch((error) => {
      console.error('Failed to start run', error);
    });
    setPlaybackState('playing');
    setCrashedNodes(new Set());
    setLatencySpikeNodes(new Set());
    toast.success('Simulation started');
  };

  const handlePause = () => {
    engineRef.current?.pause();
    setPlaybackState('paused');
    toast.info('Simulation paused');
  };

  const handleResume = () => {
    const engine = engineRef.current;
    if (!engine) {
      toast.error('Start simulation first');
      return;
    }
    engine.resume();
    setPlaybackState('playing');
    toast.success('Simulation resumed');
  };

  const handleReset = () => {
    endActiveRun();
    engineRef.current?.reset();
    engineRef.current = null;
    setPlaybackState('idle');
    setEvents([]);
    setSystemSnapshot(null);
    setCrashedNodes(new Set());
    setLatencySpikeNodes(new Set());
    toast.info('Simulation reset');
  };

  const handleTick = () => {
    if (nodes.length === 0) {
      toast.error('Add some nodes first');
      return;
    }

    if (!engineRef.current) {
      buildEngine();
    }

    engineRef.current?.step();
    if (engineRef.current) {
      setSystemSnapshot(engineRef.current.getSnapshot());
      setEvents([...engineRef.current.getEvents()]);
    }
    setPlaybackState('paused');
    toast.info('Ticked simulation');
  };

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null;
  const snapshots = systemSnapshot?.services || {};

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-gray-100">
        <Toolbar
          onExport={handleExport}
          onImport={handleImport}
          onClear={handleClear}
          onToggleMetrics={() => setMetricsCollapsed((prev) => !prev)}
          onToggleMicroservices={() => setMicroservicesCollapsed((prev) => !prev)}
          metricsCollapsed={metricsCollapsed}
          microservicesCollapsed={microservicesCollapsed}
        />
        
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
          {!metricsCollapsed && (
            <>
              <ResizablePanel defaultSize={24} minSize={16}>
                <MetricsPanel snapshot={systemSnapshot} events={events} />
              </ResizablePanel>

              <ResizableHandle />
            </>
          )}

          <ResizablePanel defaultSize={metricsCollapsed ? 100 : 76} minSize={50}>
            <div className="flex h-full overflow-hidden">
              {!microservicesCollapsed && <NodePalette />}

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

              {selectedNode && (
                <NodeConfigPanel
                  node={selectedNode}
                  onUpdate={handleUpdateNodeConfig}
                  onClose={() => setSelectedNodeId(null)}
                />
              )}
            </div>
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
