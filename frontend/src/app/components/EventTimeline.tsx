import { useEffect, useRef } from 'react';
import { SimEvent } from '../types';
import { ScrollArea } from './ui/scroll-area';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Zap,
} from 'lucide-react';

interface EventTimelineProps {
  events: SimEvent[];
}

const EVENT_ICONS: Record<SimEvent['type'], React.ReactNode> = {
  message_sent: <Activity className="w-4 h-4 text-blue-500" />,
  message_received: <CheckCircle className="w-4 h-4 text-green-500" />,
  message_dropped: <XCircle className="w-4 h-4 text-orange-500" />,
  message_error: <AlertCircle className="w-4 h-4 text-red-500" />,
  node_crashed: <XCircle className="w-4 h-4 text-red-600" />,
  node_recovered: <CheckCircle className="w-4 h-4 text-green-600" />,
  latency_spike: <Zap className="w-4 h-4 text-yellow-500" />,
  partition_split: <AlertTriangle className="w-4 h-4 text-purple-500" />,
};

export function EventTimeline({ events }: EventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const formatEventType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="h-full bg-white border-t border-gray-200 flex flex-col">
      <div className="px-4 py-2 border-b border-gray-200 flex-shrink-0">
        <h3 className="font-semibold text-sm">Event Timeline</h3>
        <div className="text-xs text-gray-500">{events.length} events</div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {events.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">No events yet. Start simulation to see events.</div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 text-xs"
            >
              <div className="mt-0.5">{EVENT_ICONS[event.type]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatEventType(event.type)}</span>
                  <span className="text-gray-400">{event.timestamp}ms</span>
                </div>
                <div className="text-gray-600 truncate">
                  {event.sourceNodeId}
                  {event.targetNodeId && ` → ${event.targetNodeId}`}
                </div>
                {event.latencyMs && (
                  <div className="text-gray-500">Latency: {event.latencyMs}ms</div>
                )}
                {event.failureInjected && (
                  <div className="text-orange-600 font-medium">Failure Injected</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}