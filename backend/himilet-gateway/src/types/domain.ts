export type PermissionMode = 'workspace_only' | 'whitelist' | 'full_access';

export interface PermissionSettings {
  mode: PermissionMode;
  workspace_root: string;
  whitelist_paths: string[];
  require_approval_on_policy_escape: boolean;
}

export interface LlmProfile {
  id: string;
  name: string;
  base_url: string;
  model: string;
  auth_type: 'api_key';
  encrypted_key?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ReminderMode = 'once' | 'repeat';
export type ReminderStatus = 'pending' | 'fired' | 'cancelled';

export interface ReminderItem {
  id: string;
  task_name: string;
  message: string;
  mode: ReminderMode;
  fire_at: string;
  interval_minutes?: number;
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stream_id?: string;
  seq: number;
  is_final: boolean;
  interrupted: boolean;
  created_at: string;
}

export interface InteractionSettings {
  enabled: boolean;
  proactive_interval_minutes: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  max_speech_chars: number;
}

export interface ClientSettings {
  updated_at: string;
  gateway_url: string;
  backend_http_url: string;
  session_id: string;
  topmost: boolean;
  pet_click_through: boolean;
  use_openclaw_adapter: boolean;
  enable_function_menu: boolean;
  active_profile_id?: string;
  interaction: InteractionSettings;
}
