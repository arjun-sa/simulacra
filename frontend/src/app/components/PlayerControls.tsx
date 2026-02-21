import { PlaybackState, PlaybackSpeed } from '../types';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';

interface PlayerControlsProps {
  state: PlaybackState;
  speed: PlaybackSpeed;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onTick: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

export function PlayerControls({
  state,
  speed,
  onStart,
  onPause,
  onResume,
  onReset,
  onTick,
  onSpeedChange,
}: PlayerControlsProps) {
  const handlePlayPause = () => {
    if (state === 'idle') {
      onStart();
    } else if (state === 'playing') {
      onPause();
    } else {
      onResume();
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
      <Button
        variant={state === 'playing' ? 'default' : 'outline'}
        size="sm"
        onClick={handlePlayPause}
      >
        {state === 'playing' ? (
          <>
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            {state === 'idle' ? 'Start' : 'Resume'}
          </>
        )}
      </Button>

      <Button variant="outline" size="sm" onClick={onReset} disabled={state === 'idle'}>
        <RotateCcw className="w-4 h-4 mr-2" />
        Reset
      </Button>

      <Button variant="outline" size="sm" onClick={onTick} disabled={state === 'playing'}>
        <SkipForward className="w-4 h-4 mr-2" />
        Tick
      </Button>

      <div className="flex items-center gap-2 ml-4">
        <span className="text-sm font-medium">Speed:</span>
        <Select value={speed.toString()} onValueChange={(v) => onSpeedChange(parseFloat(v) as PlaybackSpeed)}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.5">0.5x</SelectItem>
            <SelectItem value="1">1x</SelectItem>
            <SelectItem value="2">2x</SelectItem>
            <SelectItem value="5">5x</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          state === 'playing' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
        }`} />
        <span className="text-sm text-gray-600">
          {state === 'idle' ? 'Ready' : state === 'playing' ? 'Running' : 'Paused'}
        </span>
      </div>
    </div>
  );
}
