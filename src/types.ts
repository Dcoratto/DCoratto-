export type TicketStatus = 'Novo' | 'Orçamento' | 'Projeto' | 'Produção' | 'Instalação' | 'Finalizado';
export type UserRole = 'Super Admin' | 'Admin' | 'Colaborador';
export type DepartmentName = 'Comercial' | 'Financeiro' | 'Liberação' | 'Logística' | 'Montagem' | 'Sucesso do Cliente';

export interface WhatsAppConfig {
  phoneNumber: string;
  status: 'connected' | 'disconnected' | 'connecting';
  lastSync?: Date;
}

export interface Message {
  id: string;
  text: string;
  sender: 'customer' | 'agent';
  timestamp: Date;
  messageType?: 'text' | 'audio' | 'image' | 'video' | 'document' | 'file' | 'system';
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaSize?: number;
  attachments?: MessageAttachment[];
  isFlagged?: boolean;
  flaggedBy?: string; // User Name
  flaggedAt?: Date;
  status?: 'sending' | 'sent' | 'error';
}

export interface InternalMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  departmentName?: string;
  timestamp: Date;
  attachments?: MessageAttachment[];
  isFlagged?: boolean;
  flaggedBy?: string; // User Name
  flaggedAt?: Date;
  quotedMessageId?: string; // ID of the customer message being quoted
}

export interface MessageAttachment {
  id: string;
  messageId?: string;
  internalMessageId?: string;
  ticketId: string;
  customerId?: string;
  bucket: string;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  attachmentType: 'audio' | 'image' | 'video' | 'document' | 'file';
  uploadedBy?: string;
  createdAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface Department {
  id: string;
  name: string;
  sequence: number;
  requiredDocuments?: string[];
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  departmentId?: string;
  email?: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  departmentId: string;
  status: 'Pendente' | 'Aceito' | 'Expirado';
  createdAt: Date;
}

export interface TicketDocument {
  id: string;
  ticketId: string;
  customerId: string;
  departmentId: string;
  name: string;
  fileUrl: string;
  fileType?: string;
  uploadedBy?: string;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  customerId: string;
  title: string;
  status: TicketStatus;
  lastMessage: string;
  updatedAt: Date;
  messages: Message[];
  internalMessages: InternalMessage[];
  departmentId: string;
  assignedTo?: string; // User ID
  documents?: TicketDocument[];
}

