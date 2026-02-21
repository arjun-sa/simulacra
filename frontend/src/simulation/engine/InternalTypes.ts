export interface SimMessage {
  id: string;
  createdAt: number;
  latencyBudgetMs?: number;
  meta?: Record<string, unknown>;
}

export interface IncomingMessage {
  message: SimMessage;
  fromNodeId: string;
  receivedAt: number;
}

export interface ScheduledDelivery {
  deliverAt: number;
  sourceNodeId: string;
  targetNodeId: string;
  message: SimMessage;
  failureInjected?: boolean;
  forcedEventType?: 'message_error' | 'message_dropped';
}
