import './styles/index.scss';

export { BlockClient } from './api/client';
export { ChatDetail } from './components/ChatDetail';
export type { ChatDetailProps } from './components/ChatDetail';
export { ChatHeader } from './components/ChatHeader';
export { MessageBubble } from './components/MessageBubble';
export { Composer } from './components/Composer';
export { useChat } from './hooks/useChat';
export type { UseChatResult } from './hooks/useChat';
export { formatTime, formatDateLabel, formatLastSeen } from './utils/time';
export type {
  Auth, AuthHeader, AuthBearer, BlockConfig,
  Content, Message, Peer, Ulid, User, WsEvent,
} from './types';
