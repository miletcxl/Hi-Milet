export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface WsEnvelope<TPayload = JsonValue> {
  type: string;
  session_id: string;
  trace_id: string;
  payload: TPayload;
  timestamp: string;
}

export const EnvelopeTypes = {
  PetAction: 'pet.action',
  PetSpeak: 'pet.speak',
  PetState: 'pet.state',
  ApprovalRequest: 'approval.request',
  ApprovalResult: 'approval.result',
  UserEvent: 'user.event',
  ChatUser: 'chat.user',
  ChatAssistant: 'chat.assistant',
  ChatContinue: 'chat.continue',
  ClientStatus: 'client.status',
  SystemNotice: 'system.notice',
} as const;

export interface ChatUserPayload {
  conversation_id: string;
  message_id: string;
  text: string;
}

export interface ChatContinuePayload {
  conversation_id: string;
  parent_message_id: string;
}

export interface ChatAssistantPayload {
  conversation_id: string;
  message_id: string;
  text: string;
  stream_id: string;
  seq: number;
  is_final: boolean;
  interrupted?: boolean;
}

export interface ClientStatusPayload {
  status: string;
  detail?: string;
}

export interface ApprovalRequestPayload {
  request_id: string;
  command: string;
  reason: string;
  risk_level: string;
  timeout_ms: number;
}

export interface ApprovalResultPayload {
  request_id: string;
  decision: 'allow' | 'deny';
  note?: string;
}

export interface PetStatePayload {
  state: 'Idle' | 'Thinking' | 'Work' | 'Sleep' | 'Approval' | string;
  reason?: string;
}

export interface PetSpeakPayload {
  text: string;
  stream?: boolean;
  expression?: string;
  interrupt?: boolean;
}
