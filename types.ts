export enum AppState {
  SETUP = 'SETUP',
  LOADING_TIPS = 'LOADING_TIPS',
  MIRROR_ACTIVE = 'MIRROR_ACTIVE',
  SCARE_TRIGGERED = 'SCARE_TRIGGERED'
}

export interface SmartTip {
  id: number;
  text: string;
}

export interface ToolCall {
    functionCalls: {
        id: string;
        name: string;
        args: Record<string, any>;
    }[];
}