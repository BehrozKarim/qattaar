import { chooseAction } from './ai';
import type { Difficulty } from './ai';
import type { GameState } from './engine';

self.onmessage = ({ data }: MessageEvent<{ state: GameState; difficulty: Difficulty }>) => {
  self.postMessage(chooseAction(data.state, data.difficulty));
};
