import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MessageSquare, 
  Users, 
  LayoutDashboard, 
  Settings, 
  Search, 
  Send, 
  User as UserIcon, 
  Clock, 
  CheckCircle2, 
  CircleDot, 
  Hammer, 
  Truck,
  MoreVertical,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Database,
  AlertCircle,
  Briefcase,
  UserPlus,
  Filter,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  MailPlus,
  Trash2,
  ExternalLink,
  Flag,
  MessageCircle,
  Lock,
  ArrowRightCircle,
  AtSign,
  Paperclip,
  Image as ImageIcon,
  Mic,
  FileText,
  Info,
  Edit,
  Save,
  X,
  Upload,
  AlertTriangle,
  Folder,
  Plus,
  Quote as QuoteIcon,
  Moon,
  Sun
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';
import { Ticket, Message, TicketStatus, Customer, User, Department, UserRole, WhatsAppConfig, Invitation, InternalMessage, TicketDocument, MessageAttachment } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Session } from '@supabase/supabase-js';

export default function App() {
  const officialLogoPath = '/brand/dcoratto-logo.svg';

  type ConversationMeta = {
    unreadCount: number;
    pinned: boolean;
    markedUnread: boolean;
    lastNotifiedAt: number;
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', isDarkMode);
    localStorage.setItem('theme', isDarkMode ?'dark' : 'light');
  }, [isDarkMode]);

  // Authentication State
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  // WhatsApp Configuration State
  const [whatsapp, setWhatsapp] = useState<WhatsAppConfig>({
    phoneNumber: '+55 11 99999-8888',
    status: 'connected',
    lastSync: new Date()
  });

  const [waQR, setWaQR] = useState<string | null>(null);
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [isRequestingPair, setIsRequestingPair] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [waMaxReached, setWaMaxReached] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [inputMessage, setInputMessage] = useState('');
  const [internalInputMessage, setInternalInputMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'tickets' | 'customers' | 'admin' | 'dashboard'>('tickets');
  const [rightSidebarTab, setRightSidebarTab] = useState<'details' | 'documents'>('details');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [quotedMessageId, setQuotedMessageId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingTransfer, setPendingTransfer] = useState<{ ticketId: string; departmentId: string } | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMessage, setTransferSuccessMessage] = useState<string | null>(null);
  const [conversationMeta, setConversationMeta] = useState<Record<string, ConversationMeta>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('crm_conversation_meta') || '{}');
    } catch {
      return {};
    }
  });
  const [openTicketMenuId, setOpenTicketMenuId] = useState<string | null>(null);

  const AUTO_PROVISION_EMAIL = 'dcorattoinovacao@gmail.com';
  const AUTO_PROVISION_PASSWORD = 'sobmedida';

  const isAdminRole = (role?: string) => {
    const normalized = (role || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    return ['admin', 'administrador', 'super admin', 'superadmin', 'super administrador', 'superadministrador'].includes(normalized);
  };

  const getStandardDepartmentName = (departmentName?: string) => {
    const normalized = (departmentName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    if (normalized.includes('vendas') || normalized.includes('comercial')) return 'Comercial';
    if (normalized.includes('financeiro')) return 'Financeiro';
    if (normalized.includes('projeto') || normalized.includes('liberacao')) return 'Liberação';
    if (normalized.includes('producao') || normalized.includes('logistica')) return 'Logística';
    if (normalized.includes('instalacao') || normalized.includes('montagem')) return 'Montagem';
    if (normalized.includes('pos-venda') || normalized.includes('sucesso')) return 'Sucesso do Cliente';
    return departmentName || '';
  };

  const isPrimaryAdminEmail = (userEmail?: string) => userEmail?.trim().toLowerCase() === AUTO_PROVISION_EMAIL;

  type UploadedFilePayload = {
    url: string;
    bucket: string;
    path: string;
    originalName: string;
    fileName: string;
    mimeType: string;
    size: number;
    storageProvider: 'supabase' | 'local';
  };

  const getAttachmentType = (mimeType: string, fileName: string): MessageAttachment['attachmentType'] => {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf' || /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i.test(fileName)) return 'document';
    return 'file';
  };

  const getMediaPrefix = (type: MessageAttachment['attachmentType']) => {
    if (type === 'audio') return 'AUDIO';
    if (type === 'image') return 'IMAGE';
    if (type === 'video') return 'VIDEO';
    return 'FILE';
  };

  const buildLegacyMediaText = (type: MessageAttachment['attachmentType'], url: string) => {
    const prefix = getMediaPrefix(type);
    return `[${prefix}]${url}`;
  };

  const uploadPersistentFile = async (file: File | Blob, fallbackName: string): Promise<UploadedFilePayload> => {
    const formData = new FormData();
    formData.append('file', file, fallbackName);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.success) throw new Error(uploadData.error || 'Erro ao enviar arquivo.');

    return {
      url: uploadData.url,
      bucket: uploadData.bucket || 'chat-media',
      path: uploadData.path || uploadData.url,
      originalName: uploadData.originalName || fallbackName,
      fileName: uploadData.fileName || fallbackName,
      mimeType: uploadData.mimeType || 'application/octet-stream',
      size: uploadData.size || 0,
      storageProvider: uploadData.storageProvider || 'supabase'
    };
  };

  const createPersistentMessage = async ({
    ticketId,
    text,
    sender,
    upload
  }: {
    ticketId: string;
    text: string;
    sender: 'customer' | 'agent';
    upload?: UploadedFilePayload;
  }) => {
    const attachmentType = upload ?getAttachmentType(upload.mimeType, upload.originalName || upload.fileName) : undefined;

    const payload = {
      ticket_id: ticketId,
      text,
      sender,
      message_type: attachmentType || 'text',
      media_url: upload?.url || null,
      media_mime_type: upload?.mimeType || null,
      media_file_name: upload?.originalName || null,
      media_size: upload?.size || null
    };

    const { error: msgError } = await supabase
      .from('messages')
      .insert(payload)

    if (msgError) {
      const { error: fallbackError } = await supabase
        .from('messages')
        .insert({
          ticket_id: ticketId,
          text,
          sender
        });

      if (fallbackError) throw fallbackError;
    }

    await supabase
      .from('tickets')
      .update({ last_message: text, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  };

  // Authentication and Session Management
  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id, session.user.email || '');
      } else {
        setAuthLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id, session.user.email || '');
      } else {
        setCurrentUser(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = 15000): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Tempo esgotado ao conectar com o Supabase.')), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId!);
    }
  };

  const insertActivityLog = async ({
    actor,
    action,
    entityType,
    entityId,
    details
  }: {
    actor?: Partial<User> | null;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, any>;
  }) => {
    try {
      const { error } = await supabase.from('activity_logs').insert({
        actor_id: actor?.id || null,
        actor_name: actor?.name || actor?.email || 'Sistema',
        actor_email: actor?.email || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId || null,
        details: details || {}
      });

      if (error) {
        console.warn('[ACTIVITY_LOG] Registro ignorado:', error.message);
      }
    } catch (error) {
      console.warn('[ACTIVITY_LOG] Tabela indisponível:', error);
    }
  };

  const fetchUserProfile = async (userId: string, userEmail: string = '') => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const shouldPromotePrimaryAdmin = isPrimaryAdminEmail(data.email || userEmail) && !isAdminRole(data.role);
        const profileRole = shouldPromotePrimaryAdmin ?'Super Admin' : (data.role || 'Colaborador');
        const loggedUser = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: profileRole as UserRole,
          departmentId: data.department_id
        };

        if (shouldPromotePrimaryAdmin) {
          await supabase
            .from('profiles')
            .update({ role: 'Super Admin' })
            .eq('id', userId);
        }

        setCurrentUser(loggedUser);
        insertActivityLog({
          actor: loggedUser,
          action: 'login',
          entityType: 'profile',
          entityId: loggedUser.id,
          details: { role: loggedUser.role, departmentId: loggedUser.departmentId }
        });
      } else {
        const fallbackName = userEmail ?userEmail.split('@')[0] : 'Usuario';
        const fallbackRole = isPrimaryAdminEmail(userEmail) ?'Super Admin' : 'Colaborador';
        const { data: createdProfile, error: createProfileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            name: fallbackName,
            email: userEmail,
            role: fallbackRole
          })
          .select()
          .maybeSingle();

        if (createProfileError) throw createProfileError;

        if (createdProfile) {
          const createdUser = {
            id: createdProfile.id,
            name: createdProfile.name,
            email: createdProfile.email,
            role: createdProfile.role as UserRole,
            departmentId: createdProfile.department_id
          };
          setCurrentUser(createdUser);
          insertActivityLog({
            actor: createdUser,
            action: 'login',
            entityType: 'profile',
            entityId: createdUser.id,
            details: { role: createdUser.role, departmentId: createdUser.departmentId, createdProfile: true }
          });
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setAuthError(err instanceof Error ?err.message : 'Erro ao carregar perfil do usuario.');
    } finally {
      setAuthLoading(false);
      setAuthSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      );
      if (error) throw error;
      if (data.user) {
        await fetchUserProfile(data.user.id, data.user.email || normalizedEmail);
      }
    } catch (err: any) {
      const shouldAutoProvision =
        normalizedEmail === AUTO_PROVISION_EMAIL &&
        password === AUTO_PROVISION_PASSWORD;

      if (shouldAutoProvision) {
        try {
          const { data: signUpData, error: signUpError } = await withTimeout(
            supabase.auth.signUp({
              email: AUTO_PROVISION_EMAIL,
              password: AUTO_PROVISION_PASSWORD,
              options: {
                data: {
                  full_name: 'dcorattoinovacao'
                }
              }
            })
          );

          if (signUpError && !String(signUpError.message || '').toLowerCase().includes('already')) {
            throw signUpError;
          }

          const { data: loginData, error: loginError } = await withTimeout(
            supabase.auth.signInWithPassword({
              email: AUTO_PROVISION_EMAIL,
              password: AUTO_PROVISION_PASSWORD
            })
          );

          if (loginError) throw loginError;

          if (loginData.user) {
            await fetchUserProfile(
              loginData.user.id,
              loginData.user.email || AUTO_PROVISION_EMAIL
            );
            return;
          }

          if (signUpData.user) {
            await fetchUserProfile(
              signUpData.user.id,
              signUpData.user.email || AUTO_PROVISION_EMAIL
            );
            return;
          }
        } catch (provisionErr: any) {
          setAuthError(
            provisionErr?.message ||
            'Nao foi possivel criar/login desse usuario automaticamente.'
          );
          return;
        }
      }

      setAuthError(err.message || 'Erro ao fazer login');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const { data, error } = await withTimeout(supabase.auth.signUp({ 
        email: email.trim(), 
        password,
        options: {
          data: {
            full_name: email.trim().split('@')[0]
          }
        }
      }));
      if (error) throw error;

      if (data.user) {
        // Create initial profile
        await supabase.from('profiles').insert({
          id: data.user.id,
          name: email.trim().split('@')[0],
          email: email.trim(),
          role: 'Colaborador'
        });
      }
      alert('Cadastro realizado! Verifique seu e-mail para confirmar.');
    } catch (err: any) {
      setAuthError(err.message || 'Erro ao cadastrar');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const recordingStatusRef = useRef<'idle' | 'recording' | 'paused'>('idle');
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing State
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [editCustomerData, setEditCustomerData] = useState<Partial<Customer>>({});
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUserData, setEditUserData] = useState<Partial<User>>({});

  // Invitation Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDept, setInviteDept] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('Colaborador');
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newReqDoc, setNewReqDoc] = useState('');

  const selectedTicketIdRef = useRef(selectedTicketId);
  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const customer = selectedTicket ?customers.find(c => c.id === selectedTicket.customerId) : null;

  const ticketsRef = useRef<Ticket[]>([]);
  const customersRef = useRef<Customer[]>([]);
  const departmentsRef = useRef<Department[]>([]);
  const usersRef = useRef<User[]>([]);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    departmentsRef.current = departments;
  }, [departments]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('crm_conversation_meta', JSON.stringify(conversationMeta));
  }, [conversationMeta]);

  const isGlobalAdmin = (user?: User | null) => !!user && isAdminRole(user.role) && !user.departmentId;
  const isDepartmentChief = (user: User | null | undefined, departmentId?: string) => {
    if (!user || !departmentId || !isAdminRole(user.role)) return false;
    return isGlobalAdmin(user) || user.departmentId === departmentId;
  };
  const canFollowTransferredTicket = (ticket: Ticket | null | undefined, user: User | null = currentUser) => {
    if (!ticket || !user) return false;
    return (ticket.internalMessages || []).some(message =>
      message.senderId === user.id && message.text.includes('Ticket movido para o setor:')
    );
  };
  const canViewTicket = (ticket: Ticket, user: User | null) => {
    if (!user) return false;
    if (isGlobalAdmin(user)) return true;
    if (isDepartmentChief(user, ticket.departmentId)) return true;
    if (canFollowTransferredTicket(ticket, user)) return true;
    return ticket.departmentId === user.departmentId;
  };
  const canManageTicketAssignment = (ticket: Ticket | null | undefined) => {
    if (!ticket) return false;
    return isDepartmentChief(currentUser, ticket.departmentId);
  };
  const canSelfAssignTicket = (ticket: Ticket | null | undefined) => {
    if (!ticket || !currentUser || isAdminRole(currentUser.role)) return false;
    return ticket.departmentId === currentUser.departmentId && ticket.assignedTo !== currentUser.id;
  };
  const canInteractWithTicket = (ticket: Ticket | null | undefined) => {
    if (!ticket || !currentUser) return false;
    if (canManageTicketAssignment(ticket)) return true;
    return ticket.departmentId === currentUser.departmentId && ticket.assignedTo === currentUser.id;
  };
  const canSendInternalMessage = (ticket: Ticket | null | undefined) => {
    return canInteractWithTicket(ticket) || canFollowTransferredTicket(ticket);
  };
  const getDepartmentChief = (departmentId?: string) => {
    if (!departmentId) return null;
    return users
      .filter(user => isAdminRole(user.role) && user.departmentId === departmentId)
      .sort((a, b) => {
        const roleRank = Number(isAdminRole(b.role)) - Number(isAdminRole(a.role));
        return roleRank || a.name.localeCompare(b.name);
      })[0] || null;
  };
  const getDepartmentCollaborators = (departmentId?: string) => {
    if (!departmentId) return [];
    return users
      .filter(user => user.departmentId === departmentId && !isAdminRole(user.role))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  const getDepartmentManagerTitle = (departmentIdOrName?: string) => {
    const departmentName = departments.find(dept => dept.id === departmentIdOrName)?.name || departmentIdOrName || '';
    const normalized = departmentName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    if (normalized.includes('comercial') || normalized.includes('vendas')) return 'Gestor Comercial';
    if (normalized.includes('financeiro')) return 'Gestor Financeiro';
    if (normalized.includes('liberacao') || normalized.includes('liberação') || normalized.includes('projeto')) return 'Gestor de Liberação';
    if (normalized.includes('logistica') || normalized.includes('logística') || normalized.includes('producao') || normalized.includes('produção')) return 'Gestor de Logística';
    if (normalized.includes('montagem') || normalized.includes('instalacao') || normalized.includes('instalação')) return 'Gestor de Montagem';
    if (normalized.includes('sucesso') || normalized.includes('pos-venda') || normalized.includes('pós-venda')) return 'Gestor de Sucesso do Cliente';
    return 'Gestor do Departamento';
  };
  const getTicketAssigneeName = (ticket: Ticket) => {
    const assignedUser = users.find(user => user.id === ticket.assignedTo);
    if (assignedUser) return assignedUser.name;
    const chief = getDepartmentChief(ticket.departmentId);
    return chief ?`${chief.name} (${getDepartmentManagerTitle(ticket.departmentId)})` : getDepartmentManagerTitle(ticket.departmentId);
  };
  const departmentPalette = [
    { border: '#2563eb', bg: '#eff6ff', text: '#1d4ed8' },
    { border: '#16a34a', bg: '#f0fdf4', text: '#15803d' },
    { border: '#f97316', bg: '#fff7ed', text: '#c2410c' },
    { border: '#9333ea', bg: '#faf5ff', text: '#7e22ce' },
    { border: '#dc2626', bg: '#fef2f2', text: '#b91c1c' },
    { border: '#0891b2', bg: '#ecfeff', text: '#0e7490' }
  ];
  const getDepartmentAccent = (departmentIdOrName?: string) => {
    const departmentIndex = Math.max(0, departments.findIndex(dept =>
      dept.id === departmentIdOrName || dept.name.toLowerCase() === departmentIdOrName?.toLowerCase()
    ));
    return departmentPalette[departmentIndex % departmentPalette.length];
  };
  const getTransferDepartmentName = (text: string) => {
    const match = text.match(/setor:\s*([^.\n]+)/i);
    return match?.[1]?.split(' e atrib')[0]?.replace(/^["']|["']$/g, '').trim();
  };
  const getActivityLabel = (action: string) => {
    const labels: Record<string, string> = {
      login: 'Login',
      document_upload: 'Documento enviado',
      media_upload: 'Mídia enviada',
      ticket_assigned: 'Cliente atribuído',
      ticket_unassigned: 'Cliente voltou ao Gestor'
    };
    return labels[action] || action;
  };

  const updateConversationMeta = (ticketId: string, updater: (meta: ConversationMeta) => ConversationMeta) => {
    setConversationMeta(prev => {
      const currentMeta = prev[ticketId] || {
        unreadCount: 0,
        pinned: false,
        markedUnread: false,
        lastNotifiedAt: 0
      };

      return {
        ...prev,
        [ticketId]: updater(currentMeta)
      };
    });
  };

  const markConversationRead = (ticketId: string) => {
    updateConversationMeta(ticketId, meta => ({ ...meta, unreadCount: 0, markedUnread: false }));
  };

  const markConversationUnread = (ticketId: string) => {
    updateConversationMeta(ticketId, meta => ({
      ...meta,
      unreadCount: Math.max(meta.unreadCount, 1),
      markedUnread: true,
      lastNotifiedAt: Date.now()
    }));
  };

  const togglePinnedConversation = (ticketId: string) => {
    updateConversationMeta(ticketId, meta => ({ ...meta, pinned: !meta.pinned, lastNotifiedAt: Date.now() }));
  };

  const markConversationNotified = (ticketId?: string, incrementUnread: boolean = true) => {
    if (!ticketId) return;
    updateConversationMeta(ticketId, meta => ({
      ...meta,
      unreadCount: incrementUnread ?meta.unreadCount + 1 : Math.max(meta.unreadCount, 1),
      markedUnread: true,
      lastNotifiedAt: Date.now()
    }));
  };

  const getTicketCustomerName = (ticket?: Ticket | null) => {
    if (!ticket) return 'Cliente';
    return customersRef.current.find(item => item.id === ticket.customerId)?.name || ticket.title || 'Cliente';
  };

  const isCurrentUserDepartmentManager = (departmentId?: string) => {
    const user = currentUserRef.current;
    if (!user || !departmentId) return false;
    return isAdminRole(user.role) && user.departmentId === departmentId;
  };

  const shouldNotifyCurrentUserAboutCustomerMessage = (ticket?: Ticket | null) => {
    const user = currentUserRef.current;
    if (!user || !ticket) return false;
    if (ticket.assignedTo) return ticket.assignedTo === user.id;
    return isCurrentUserDepartmentManager(ticket.departmentId);
  };

  const notifyNewCustomerMessage = (ticketId?: string) => {
    const ticket = ticketsRef.current.find(item => item.id === ticketId);
    if (!ticket || !shouldNotifyCurrentUserAboutCustomerMessage(ticket)) return;
    if (selectedTicketIdRef.current === ticket.id) return;
    markConversationNotified(ticket.id, true);
  };

  const notifyDepartmentArrival = (ticketId?: string, departmentId?: string, ticketRow?: any) => {
    const ticket = ticketsRef.current.find(item => item.id === ticketId);
    if (!departmentId || !isCurrentUserDepartmentManager(departmentId)) return;

    markConversationNotified(ticketId, false);
  };

  const notifyTicketAssignment = (ticketId?: string, assigneeId?: string | null) => {
    const user = currentUserRef.current;
    if (!ticketId || !user || assigneeId !== user.id) return;
    markConversationNotified(ticketId, false);
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial Data Fetching linked to session
  useEffect(() => {
    if (session && currentUser) {
      fetchData(true);

      // Real-time subscriptions
      console.log('[SUPABASE] Setting up real-time subscriptions...');
      const channel = supabase
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
          console.log('[SUPABASE] Ticket change detected:', payload);
          const newTicket = payload.new as any;
          const currentTicketSnapshot = ticketsRef.current.find(ticket => ticket.id === newTicket?.id);
          if (payload.eventType === 'INSERT') {
            notifyDepartmentArrival(newTicket?.id, newTicket?.department_id, newTicket);
          }
          if (payload.eventType === 'UPDATE' && newTicket?.department_id && currentTicketSnapshot?.departmentId !== newTicket.department_id) {
            notifyDepartmentArrival(newTicket.id, newTicket.department_id, newTicket);
          }
          if (payload.eventType === 'UPDATE' && newTicket?.assigned_to && currentTicketSnapshot?.assignedTo !== newTicket.assigned_to) {
            notifyTicketAssignment(newTicket.id, newTicket.assigned_to);
          }
          fetchData(false);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          console.log('[SUPABASE] Message change detected:', payload);
          const newMessage = payload.new as any;
          if (payload.eventType === 'INSERT' && newMessage?.sender === 'customer') {
            notifyNewCustomerMessage(newMessage.ticket_id);
          }
          fetchData(false);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_messages' }, (payload) => {
          console.log('[SUPABASE] Internal message change detected:', payload);
          fetchData(false);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
          console.log('[SUPABASE] Customer change detected:', payload);
          fetchData(false);
        })
        .subscribe((status) => {
          console.log('[SUPABASE] Subscription status:', status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session, currentUser?.id]);

  // Offline/Online Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchData(false);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cache tickets for offline
  useEffect(() => {
    const cached = localStorage.getItem('crm_tickets_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Convert date strings back to Date objects
        const formatted = parsed.map((t: any) => ({
          ...t,
          updatedAt: new Date(t.updatedAt),
          messages: t.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
          internalMessages: t.internalMessages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setTickets(formatted);
      } catch (e) {
        console.error('Error parsing cache', e);
      }
    }
  }, []);

  useEffect(() => {
    if (tickets.length > 0) {
      localStorage.setItem('crm_tickets_cache', JSON.stringify(tickets));
    }
  }, [tickets]);

  // Polling for real-time updates (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) {
        fetchData(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial data from Supabase
  const fetchData = async (isInitial: boolean = false) => {
    if (isInitial) setLoading(true);
    if (!navigator.onLine) {
      if (isInitial) setLoading(false);
      return;
    }
    console.log('[SUPABASE] Fetching data...');
    try {
      setSupabaseError(null);
      const [
        { data: depts },
        { data: profs },
        { data: custs },
        { data: ticks },
        { data: invs },
        { data: docs }
      ] = await Promise.all([
        supabase.from('departments').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('tickets').select('*, messages(*), internal_messages(*)'),
        supabase.from('invitations').select('*'),
        supabase.from('ticket_documents').select('*')
      ]);

      if (depts) {
        // Sort by sequence if available, otherwise by created_at or name
        const sorted = depts.sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));
        setDepartments(sorted.map((d: any) => ({
          ...d,
          name: getStandardDepartmentName(d.name),
          requiredDocuments: d.required_documents || []
        })));
        if (sorted.length > 0 && !inviteDept) setInviteDept(sorted[0].id);
      }
      if (profs) setUsers(profs.map(p => ({ ...p, role: p.role as UserRole })));
      if (custs) setCustomers(custs);
      if (invs) setInvitations(invs.map(i => ({ ...i, role: i.role as UserRole, createdAt: new Date(i.created_at) })));

      const { data: logs, error: logsError } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80);

      if (!logsError && logs) {
        setActivityLogs(logs);
      }
      
      const ticketDocs = (docs || []).map((d: any) => ({
        id: d.id,
        ticketId: d.ticket_id,
        customerId: d.customer_id,
        departmentId: d.department_id,
        name: d.name,
        fileUrl: d.file_url,
        fileType: d.file_type,
        uploadedBy: d.uploaded_by,
        createdAt: new Date(d.created_at)
      }));

      if (ticks) {
        const formattedTickets: Ticket[] = ticks.map(t => ({
          id: t.id,
          customerId: t.customer_id,
          title: t.title,
          status: t.status as TicketStatus,
          departmentId: t.department_id,
          assignedTo: t.assigned_to,
          lastMessage: t.last_message,
          updatedAt: new Date(t.updated_at),
          messages: (t.messages || []).map((m: any) => ({ 
            ...m, 
            timestamp: new Date(m.timestamp),
            messageType: m.message_type,
            mediaUrl: m.media_url,
            mediaMimeType: m.media_mime_type,
            mediaFileName: m.media_file_name,
            mediaSize: m.media_size,
            isFlagged: m.is_flagged,
            flaggedBy: m.flagged_by,
            flaggedAt: m.flagged_at ?new Date(m.flagged_at) : undefined
          })).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime()),
          internalMessages: (t.internal_messages || []).map((m: any) => ({ 
            ...m, 
            timestamp: new Date(m.timestamp),
            isFlagged: m.is_flagged,
            flaggedBy: m.flagged_by,
            flaggedAt: m.flagged_at ?new Date(m.flagged_at) : undefined,
            senderId: m.sender_id,
            senderName: m.sender_name,
            departmentName: m.department_name,
            quotedMessageId: m.quoted_message_id
          })).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime()),
          documents: ticketDocs.filter(doc => doc.ticketId === t.id)
        })).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        
        setTickets(formattedTickets);
        
        // Only set initial selected ticket if none is selected
        if (formattedTickets.length > 0 && !selectedTicketIdRef.current) {
          setSelectedTicketId(formattedTickets[0].id);
        }
      }
      setSupabaseStatus('connected');
    } catch (error) {
      console.error('[SUPABASE] Error fetching data:', error);
      setSupabaseStatus('error');
      setSupabaseError(error instanceof Error ?error.message : String(error));
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
  }, []);

  // Poll WhatsApp Status
  useEffect(() => {
    let isMounted = true;
    const pollStatus = async () => {
      try {
        const response = await fetch('/api/whatsapp/status');
        if (!response.ok) {
          // Silent fail for non-200 during polling (e.g. server restarting)
          return;
        }
        const data = await response.json();
        if (isMounted) {
          setWaStatus(data.status);
          setWaQR(data.qr);
          setWaPairingCode(data.pairingCode);
          setWaMaxReached(data.maxReached);
          setWhatsapp(prev => ({
            ...prev,
            status: data.status === 'connected' ?'connected' : 'disconnected'
          }));
        }
      } catch (error) {
        if (isMounted) {
          // Only log if it's not a transient fetch error
          if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('NetworkError'))) {
            setWaStatus('disconnected');
          } else {
            console.error('Error polling WA status:', error instanceof Error ?error.message : error);
          }
        }
      }
    };

    const interval = setInterval(pollStatus, 5000);
    pollStatus();
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedTicket?.messages]);

  // Filter tickets based on role
  const filteredTickets = useMemo(() => tickets.filter(t => {
    return canViewTicket(t, currentUser);
  }), [tickets, currentUser, users]);
  const sortedTickets = useMemo(() => [...filteredTickets].sort((a, b) => {
    const aMeta = conversationMeta[a.id];
    const bMeta = conversationMeta[b.id];
    const aPinned = Number(!!aMeta?.pinned);
    const bPinned = Number(!!bMeta?.pinned);
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aUnread = Number((aMeta?.unreadCount || 0) > 0 || !!aMeta?.markedUnread);
    const bUnread = Number((bMeta?.unreadCount || 0) > 0 || !!bMeta?.markedUnread);
    if (aUnread !== bUnread) return bUnread - aUnread;

    const aActivity = Math.max(a.updatedAt.getTime(), aMeta?.lastNotifiedAt || 0);
    const bActivity = Math.max(b.updatedAt.getTime(), bMeta?.lastNotifiedAt || 0);
    return bActivity - aActivity;
  }), [filteredTickets, conversationMeta]);
  const visibleCustomers = customers.filter(customer => {
    return filteredTickets.some(ticket => ticket.customerId === customer.id) || isGlobalAdmin(currentUser);
  });

  useEffect(() => {
    if (!selectedTicketId) {
      if (sortedTickets.length > 0) setSelectedTicketId(sortedTickets[0].id);
      return;
    }

    if (!filteredTickets.some(ticket => ticket.id === selectedTicketId)) {
      setSelectedTicketId(sortedTickets[0]?.id || null);
    }
  }, [filteredTickets, sortedTickets, selectedTicketId]);

  const selectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    markConversationRead(ticketId);
    setOpenTicketMenuId(null);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: inviteEmail, 
          department: inviteDept, 
          role: inviteRole 
        })
      });
      
      const data = await response.json();

      const { data: newInvite, error } = await supabase
        .from('invitations')
        .insert({
          email: inviteEmail,
          department_id: inviteDept,
          role: inviteRole,
          status: 'Pendente'
        })
        .select()
        .single();

      if (error) throw error;

      setInvitations([
        { ...newInvite, departmentId: newInvite.department_id, role: newInvite.role as UserRole, createdAt: new Date(newInvite.created_at) },
        ...invitations
      ]);
      setInviteEmail('');
      alert(data.status === 'simulated' ?'Convite simulado com sucesso!' : 'Convite enviado por e-mail!');
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Erro ao enviar convite.');
    }
  };

  const handleAcceptInvite = (invite: Invitation) => {
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: invite.email.split('@')[0],
      email: invite.email,
      role: invite.role,
      departmentId: invite.departmentId
    };

    setUsers([...users, newUser]);
    setInvitations(invitations.filter(i => i.id !== invite.id));
  };

  const handleRestartWA = async () => {
    try {
      setWaStatus('connecting');
      setWaQR(null);
      setWaPairingCode(null);
      const response = await fetch('/api/whatsapp/restart', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert('Erro ao reiniciar: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error restarting WA:', error);
      alert('Erro de rede ao reiniciar WhatsApp');
    }
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhone.trim()) return;
    setIsRequestingPair(true);
    try {
      const res = await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pairingPhone })
      });
      const data = await res.json();
      if (data.success) {
        setWaPairingCode(data.code);
      } else {
        alert('Erro ao solicitar código: ' + data.error);
      }
    } catch (error) {
      console.error('Error requesting pairing code:', error);
      alert('Erro ao conectar com o servidor.');
    } finally {
      setIsRequestingPair(false);
    }
  };

  const handleAddCustomer = async () => {
    const name = prompt('Nome do Cliente:');
    if (!name) return;
    const phone = prompt('Telefone (com DDD):');
    if (!phone) return;
    const email = prompt('E-mail:');
    const address = prompt('Endereço:');

    try {
      const { error } = await supabase
        .from('customers')
        .insert({ name, phone, email, address });
      
      if (error) throw error;
      alert('Cliente adicionado com sucesso!');
      fetchData(false);
    } catch (error) {
      console.error('Error adding customer:', error);
      alert('Erro ao adicionar cliente.');
    }
  };

  const handleViewCustomerHistory = (customerId: string) => {
    const ticket = filteredTickets.find(t => t.customerId === customerId);
    if (ticket) {
      setSelectedTicketId(ticket.id);
      setActiveTab('tickets');
    } else {
      alert('Nenhum atendimento encontrado para este cliente.');
    }
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>, documentCategory?: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicketId || !currentUser) return;

    const ticket = tickets.find(t => t.id === selectedTicketId);
    if (!ticket) return;
    if (!canInteractWithTicket(ticket)) {
      alert('Você não tem permissão para anexar documentos neste cliente.');
      return;
    }

    try {
      setLoading(true);
      // 1. Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
      const filePath = `documents/${selectedTicketId}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      // 3. Save to ticket_documents table
      const { data: docData, error: docError } = await supabase
        .from('ticket_documents')
        .insert({
          ticket_id: selectedTicketId,
          customer_id: ticket.customerId,
          department_id: ticket.departmentId || currentUser.departmentId,
          name: documentCategory || file.name,
          file_url: publicUrl,
          file_type: fileExt,
          uploaded_by: currentUser.id
        })
        .select()
        .single();

      if (docError) throw docError;

      // Update local state
      const newDoc: TicketDocument = {
        id: docData.id,
        ticketId: selectedTicketId,
        customerId: ticket.customerId,
        departmentId: ticket.departmentId || currentUser.departmentId || '',
        name: documentCategory || file.name,
        fileUrl: publicUrl,
        fileType: fileExt,
        uploadedBy: currentUser.id,
        createdAt: new Date()
      };

      setTickets(prev => prev.map(t => t.id === selectedTicketId ?{ 
        ...t, 
        documents: [...(t.documents || []), newDoc] 
      } : t));

      // Also create an internal message audit log
      await supabase.from('internal_messages').insert({
        ticket_id: selectedTicketId,
        text: `ARQUIVO ANEXADO: ${newDoc.name}`,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        department_name: departments.find(d => d.id === currentUser.departmentId)?.name
      });

      insertActivityLog({
        actor: currentUser,
        action: 'document_upload',
        entityType: 'ticket_document',
        entityId: newDoc.id,
        details: {
          ticketId: selectedTicketId,
          customerId: ticket.customerId,
          departmentId: ticket.departmentId,
          fileName: newDoc.name,
          fileType: newDoc.fileType,
          fileUrl: newDoc.fileUrl
        }
      });

    } catch (error: any) {
      console.error('Error uploading document:', error);
      alert('Erro ao enviar documento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const canAccessSystemSettings = isAdminRole(currentUser?.role);

  const handleSettings = () => {
    if (!canAccessSystemSettings) {
      alert('Você não tem permissão para acessar as configurações do sistema.');
      return;
    }
    setActiveTab('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAssignTicket = async (ticketId: string, assigneeId: string | null) => {
    const ticket = tickets.find(t => t.id === ticketId);
    const isSelfAssignment = !!currentUser && assigneeId === currentUser.id && canSelfAssignTicket(ticket);
    if (!ticket || (!canManageTicketAssignment(ticket) && !isSelfAssignment)) {
      alert('Apenas o Gestor atual pode atribuir este cliente, ou o colaborador pode assumir para si.');
      return;
    }

    if (assigneeId) {
      const assignee = users.find(user => user.id === assigneeId);
      if (!assignee || assignee.departmentId !== ticket.departmentId || isAdminRole(assignee.role)) {
        alert('Selecione um colaborador do departamento atual.');
        return;
      }
    }

    const previousTickets = tickets;
    setTickets(prev => prev.map(t => t.id === ticketId ?{
      ...t,
      assignedTo: assigneeId || undefined,
      updatedAt: new Date()
    } : t));

    try {
      const { error } = await supabase
        .from('tickets')
        .update({
          assigned_to: assigneeId,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticketId);

      if (error) throw error;

      const assignee = assigneeId ?users.find(user => user.id === assigneeId) : null;
      const ticketCustomer = customers.find(customer => customer.id === ticket.customerId);
      insertActivityLog({
        actor: currentUser,
        action: assigneeId ?'ticket_assigned' : 'ticket_unassigned',
        entityType: 'ticket',
        entityId: ticketId,
        details: {
          ticketId,
          customerId: ticket.customerId,
          customerName: ticketCustomer?.name,
          departmentId: ticket.departmentId,
          assignedTo: assigneeId,
          assignedToName: assignee?.name || null
        }
      });
    } catch (error) {
      console.error('Error assigning ticket:', error);
      setTickets(previousTickets);
      alert('Erro ao atribuir cliente.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!currentUser) return;
    if (userId === currentUser.id) {
      alert('Você não pode excluir sua própria conta logada.');
      return;
    }
    if (!confirm('Tem certeza que deseja excluir este colaborador do sistema?')) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (editingUser === userId) {
        setEditingUser(null);
        setEditUserData({});
      }
      alert('Colaborador excluído com sucesso.');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert('Erro ao excluir colaborador: ' + (error?.message || error));
    }
  };

  const updateRecordingStatus = (status: 'idle' | 'recording' | 'paused') => {
    setRecordingStatus(status);
    recordingStatusRef.current = status;
  };

  const startRecording = async () => {
    console.log('[AUDIO] startRecording called');
    const ticket = tickets.find(t => t.id === selectedTicketId);
    if (!canInteractWithTicket(ticket)) {
      alert('Você não tem permissão para enviar áudio para este cliente.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        console.log('[AUDIO] recorder.onstop triggered, ref status:', recordingStatusRef.current);
        // If recordingStatus is idle, it means it was cancelled
        if (recordingStatusRef.current === 'idle') {
          console.log('[AUDIO] Recording was cancelled, skipping upload');
          return;
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/mpeg' });
        console.log('[AUDIO] Audio blob created, size:', audioBlob.size);
        
        try {
          const uploadData = await uploadPersistentFile(audioBlob, `audio-${Date.now()}.mp3`);
          const audioUrl = uploadData.url;
          console.log('[AUDIO] Upload successful, URL:', audioUrl);
          
          if (selectedTicketId) {
            const messageText = buildLegacyMediaText('audio', audioUrl);
            await createPersistentMessage({
              ticketId: selectedTicketId,
              text: messageText,
              sender: 'agent',
              upload: uploadData
            });

            // Also send to WhatsApp
            const ticket = tickets.find(t => t.id === selectedTicketId);
            const customer = customers.find(c => c.id === ticket?.customerId);
            if (customer?.phone) {
              console.log('[AUDIO] Sending audio to WhatsApp:', customer.phone);
              await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  to: customer.phone, 
                  message: messageText
                })
              });
            }

            insertActivityLog({
              actor: currentUser,
              action: 'media_upload',
              entityType: 'message',
              entityId: selectedTicketId,
              details: {
                mediaType: 'audio',
                ticketId: selectedTicketId,
                customerId: ticket?.customerId,
                fileName: uploadData.originalName,
                mimeType: uploadData.mimeType,
                size: uploadData.size,
                url: uploadData.url
              }
            });

            fetchData(false);
          }
        } catch (err) {
          console.error('[AUDIO] Error uploading audio:', err);
          alert('Erro ao enviar áudio.');
        }
        updateRecordingStatus('idle');
      };

      recorder.start();
      updateRecordingStatus('recording');
    } catch (e) {
      console.error('[AUDIO] Error starting recording:', e);
      alert('Erro ao acessar microfone: ' + e);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      updateRecordingStatus('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      updateRecordingStatus('recording');
    }
  };

  const cancelRecording = () => {
    console.log('[AUDIO] cancelRecording called');
    if (mediaRecorderRef.current) {
      updateRecordingStatus('idle'); // Set to idle before stopping to skip upload
      mediaRecorderRef.current.stop();
      // Stop all tracks to release microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const stopRecording = () => {
    console.log('[AUDIO] stopRecording called');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Stop all tracks to release microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicketId) return;
    const ticket = tickets.find(t => t.id === selectedTicketId);
    if (!canInteractWithTicket(ticket)) {
      alert('Você não tem permissão para enviar arquivos para este cliente.');
      return;
    }

    try {
      const uploadData = await uploadPersistentFile(file, file.name);
      const fileUrl = uploadData.url;
      const attachmentType = getAttachmentType(uploadData.mimeType, uploadData.originalName || file.name);
      const messageText = buildLegacyMediaText(attachmentType, fileUrl);

      await createPersistentMessage({
        ticketId: selectedTicketId,
        text: messageText,
        sender: 'agent',
        upload: uploadData
      });

      // Also send to WhatsApp
      const customer = customers.find(c => c.id === ticket?.customerId);
      if (customer?.phone) {
        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            to: customer.phone, 
            message: messageText
          })
        });
      }

      insertActivityLog({
        actor: currentUser,
        action: attachmentType === 'document' || attachmentType === 'file' ?'document_upload' : 'media_upload',
        entityType: 'message',
        entityId: selectedTicketId,
        details: {
          mediaType: attachmentType,
          ticketId: selectedTicketId,
          customerId: ticket?.customerId,
          fileName: uploadData.originalName,
          mimeType: uploadData.mimeType,
          size: uploadData.size,
          url: uploadData.url
        }
      });

      fetchData(false);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Erro ao enviar arquivo.');
    }
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;
    try {
      const { error } = await supabase
        .from('customers')
        .update(editCustomerData)
        .eq('id', editingCustomer);
      if (error) throw error;
      setEditingCustomer(null);
      fetchData(false);
    } catch (error) {
      console.error('Error updating customer:', error);
    }
  };

  const handleUpdateDeptRequirements = async (deptId: string, requirements: string[]) => {
    try {
      const { error } = await supabase
        .from('departments')
        .update({ required_documents: requirements })
        .eq('id', deptId);
      if (error) throw error;
      fetchData(false);
    } catch (error) {
      console.error('Error updating department requirements:', error);
    }
  };

  const handleUpdateDept = async () => {
    if (!editingDept) return;
    try {
      const { error } = await supabase
        .from('departments')
        .update({ name: editDeptName })
        .eq('id', editingDept);
      if (error) throw error;
      setEditingDept(null);
      fetchData(false);
    } catch (error) {
      console.error('Error updating department:', error);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: editUserData.role,
          department_id: editUserData.departmentId
        })
        .eq('id', editingUser);
      if (error) throw error;
      setEditingUser(null);
      fetchData(false);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleAddDepartment = async () => {
    console.log('[ADMIN] handleAddDepartment called');
    if (!newDeptName.trim()) {
      console.log('[ADMIN] Add department empty name');
      return;
    }
    
    const sequence = departments.length > 0 ?Math.max(...departments.map(d => d.sequence || 0)) + 1 : 1;
    console.log(`[ADMIN] Adding department: ${newDeptName} with sequence: ${sequence}`);
    
    try {
      // Try with sequence first
      const { data, error } = await supabase
        .from('departments')
        .insert({ name: newDeptName, sequence })
        .select()
        .maybeSingle();
        
      if (error) {
        // Fallback if sequence column doesn't exist
        console.warn('Failed to insert with sequence, trying without it...', error);
        const { data: data2, error: error2 } = await supabase
          .from('departments')
          .insert({ name: newDeptName })
          .select()
          .maybeSingle();
        
        if (error2) throw error2;
        if (data2) {
          console.log('[ADMIN] Department added successfully (fallback):', data2);
          setDepartments(prev => [...prev, data2].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
        }
      } else if (data) {
        console.log('[ADMIN] Department added successfully:', data);
        setDepartments(prev => [...prev, data].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
      }
      setNewDeptName('');
      setIsAddingDept(false);
    } catch (e: any) {
      console.error('[ADMIN] Error adding department:', e);
      alert('Erro ao adicionar departamento: ' + (e.message || e));
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este departamento? Isso pode afetar tickets e usuários vinculados.')) return;
    
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      setDepartments(prev => prev.filter(d => d.id !== id));
    } catch (e: any) {
      alert('Erro ao excluir departamento: ' + e.message);
    }
  };

  const handleUpdateDeptOrder = async (id: string, direction: 'up' | 'down') => {
    const index = departments.findIndex(d => d.id === id);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ?index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= departments.length) return;
    
    const newDepts = [...departments];
    const temp = newDepts[index];
    newDepts[index] = newDepts[newIndex];
    newDepts[newIndex] = temp;
    
    // Update sequences locally
    const updatedDepts = newDepts.map((d, i) => ({ ...d, sequence: i + 1 }));
    setDepartments(updatedDepts);
    
    // Persist changes
    try {
      for (const dept of updatedDepts) {
        await supabase
          .from('departments')
          .update({ sequence: dept.sequence })
          .eq('id', dept.id);
      }
    } catch (e: any) {
      console.error('Error updating department order:', e);
    }
  };

  const handleFlagMessage = async (ticketId: string, messageId: string, isInternal: boolean = false) => {
    const table = isInternal ?'internal_messages' : 'messages';
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const msg = isInternal 
      ?ticket.internalMessages.find(m => m.id === messageId)
      : ticket.messages.find(m => m.id === messageId);
    
    if (!msg) return;

    const isFlagged = !msg.isFlagged;

    // Optimistic update
    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        const updateMsgs = (msgs: any[]) => msgs.map(m => m.id === messageId ?{ 
          ...m, 
          isFlagged, 
          flaggedBy: isFlagged ?currentUser?.name : null,
          flaggedAt: isFlagged ?new Date() : undefined
        } : m);
        return {
          ...t,
          messages: isInternal ?t.messages : updateMsgs(t.messages),
          internalMessages: isInternal ?updateMsgs(t.internalMessages) : t.internalMessages
        };
      }
      return t;
    }));

    try {
      const { error } = await supabase
        .from(table)
        .update({
          is_flagged: isFlagged,
          flagged_by: isFlagged ?currentUser?.name : null,
          flagged_at: isFlagged ?new Date().toISOString() : null
        })
        .eq('id', messageId);

      if (error) throw error;

      // If flagged, also send to internal chat automatically
      if (isFlagged && !isInternal) {
        const contextText = msg.text.includes('[AUDIO]') ?'[Audio]' : 
                           msg.text.includes('[IMAGE]') ?'[Imagem]' : 
                           msg.text.includes('[VIDEO]') ?'[Video]' : 
                           msg.text.includes('[FILE]') ?'[Arquivo]' : 
                           `"${msg.text.substring(0, 100)}${msg.text.length > 100 ?'...' : ''}"`;

        await supabase
          .from('internal_messages')
          .insert({
            ticket_id: ticketId,
            text: `MENSAGEM MARCADA: ${contextText}`,
            sender_id: 'system',
            sender_name: 'Sistema',
            quoted_message_id: messageId
          });
      }
    } catch (error) {
      console.error('Error flagging message:', error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, isInternal: boolean = false) => {
    e?.preventDefault();
    const messageText = isInternal ?internalInputMessage : inputMessage;
    if (!messageText.trim() || !selectedTicketId) return;
    const activeTicket = tickets.find(t => t.id === selectedTicketId);
    if (isInternal ?!canSendInternalMessage(activeTicket) : !canInteractWithTicket(activeTicket)) {
      alert(isInternal
        ?'Voce nao tem permissao para enviar mensagens internas neste cliente.'
        : 'Voce nao tem permissao para interagir com este cliente.'
      );
      return;
    }

    if (!isOnline) {
      alert('Você está offline. Conecte-se à internet para enviar mensagens.');
      return;
    }

    console.log(`Sending ${isInternal ?'internal' : 'WhatsApp'} message...`);

    if (isInternal) {
      // Optimistic update
      const tempId = 'temp-' + Date.now();
      const userDept = departments.find(d => d.id === currentUser?.departmentId);
      const newInternalMsg: InternalMessage = {
        id: tempId,
        text: messageText,
        senderId: currentUser?.id || 'unknown',
        senderName: currentUser?.name || 'Sistema',
        departmentName: userDept?.name,
        timestamp: new Date(),
        quotedMessageId: quotedMessageId || undefined
      };
      setTickets(prev => prev.map(t => t.id === selectedTicketId ?{ ...t, internalMessages: [...t.internalMessages, newInternalMsg] } : t));

      try {
        console.log('[CHAT] Inserting internal message into Supabase...');
        // Ensure quotedMessageId is valid (not a temporary ID)
        const validQuotedId = quotedMessageId && !quotedMessageId.startsWith('temp-') ?quotedMessageId : null;
        
        // Try to insert with department_name
        const { error } = await supabase
          .from('internal_messages')
          .insert({
            ticket_id: selectedTicketId,
            text: messageText,
            sender_id: currentUser?.id,
            sender_name: currentUser?.name,
            department_name: userDept?.name,
            quoted_message_id: validQuotedId
          });

        if (error) {
          console.error('[CHAT] Error inserting internal message:', error);
          // Fallback: include department in the text or sender name if column missing
          await supabase
            .from('internal_messages')
            .insert({
              ticket_id: selectedTicketId,
              text: `[${userDept?.name || 'Geral'}] ${messageText}`,
              sender_id: currentUser?.id,
              sender_name: currentUser?.name,
              quoted_message_id: validQuotedId
            });
        }
        setInternalInputMessage('');
        setQuotedMessageId(null);
      } catch (error) {
        console.error('Error sending internal message:', error);
      }
    } else {
      const ticket = activeTicket;
      const customer = customers.find(c => c.id === ticket?.customerId);

      if (!customer?.phone) {
        console.error('Cannot send WhatsApp: Customer phone missing');
        return;
      }

      // Optimistic update
      const tempId = 'temp-' + Date.now();
      const newMsg: Message = {
        id: tempId,
        text: messageText,
        sender: 'agent',
        timestamp: new Date(),
        status: 'sending'
      };
      setTickets(prev => prev.map(t => t.id === selectedTicketId ?{ 
        ...t, 
        messages: [...t.messages, newMsg], 
        lastMessage: messageText, 
        updatedAt: new Date() 
      } : t));

      try {
        // Call backend to send real WhatsApp message
        const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            to: customer.phone, 
            message: messageText 
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send WhatsApp message');
        }

        const { error } = await supabase
          .from('messages')
          .insert({
            ticket_id: selectedTicketId,
            text: messageText,
            sender: 'agent'
          });

        if (error) throw error;

        // Update ticket last message
        await supabase
          .from('tickets')
          .update({ last_message: messageText, updated_at: new Date().toISOString() })
          .eq('id', selectedTicketId);

        setInputMessage('');
      } catch (error) {
        console.error('Error sending WhatsApp:', error);
      }
    }
  };

  const validateDepartmentTransfer = (ticket: Ticket, targetDepartmentId: string) => {
    if (!canInteractWithTicket(ticket)) {
      alert('Voce nao tem permissao para mover este cliente.');
      return false;
    }

    if (ticket.departmentId === targetDepartmentId) return false;

    const currentDept = departments.find(d => d.id === ticket.departmentId);
    const requirements = currentDept?.requiredDocuments || [];
    const missingDocs = requirements.filter(req =>
      !ticket.documents?.some(doc => doc.name === req)
    );

    if (missingDocs.length > 0) {
      alert(`Bloqueio de Fluxo:\n\nOs seguintes documentos sao obrigatorios para o setor "${currentDept?.name}" e devem ser anexados antes de prosseguir:\n\n- ${missingDocs.join('\n- ')}`);
      setRightSidebarTab('documents');
      return false;
    }

    return true;
  };

  const requestDepartmentTransfer = (ticketId: string, targetDepartmentId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket || !validateDepartmentTransfer(ticket, targetDepartmentId)) return;
    setPendingTransfer({ ticketId, departmentId: targetDepartmentId });
  };

  const handleMoveToNextDept = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const currentIndex = departments.findIndex(d => d.id === ticket.departmentId);
    const nextDept = departments[currentIndex + 1];

    if (nextDept) {
      requestDepartmentTransfer(ticketId, nextDept.id);
    } else {
      console.log('No next department found');
      alert('Este ja e o ultimo setor disponivel.');
    }
  };

  const confirmDepartmentTransfer = async () => {
    if (!pendingTransfer || !currentUser) return;

    const ticket = tickets.find(t => t.id === pendingTransfer.ticketId);
    const targetDept = departments.find(d => d.id === pendingTransfer.departmentId);
    const ticketCustomer = ticket ?customers.find(c => c.id === ticket.customerId) : null;
    if (!ticket || !targetDept) return;

    setTransferSubmitting(true);

    const transferText = `Ticket movido para o setor: ${targetDept.name}`;
    const transferMessage: InternalMessage = {
      id: `temp-transfer-${Date.now()}`,
      text: transferText,
      senderId: currentUser.id,
      senderName: currentUser.name,
      departmentName: departments.find(d => d.id === currentUser.departmentId)?.name,
      timestamp: new Date()
    };

    setTickets(prev => prev.map(t => t.id === ticket.id ?{
      ...t,
      departmentId: targetDept.id,
      assignedTo: undefined,
      updatedAt: new Date(),
      internalMessages: [...t.internalMessages, transferMessage]
    } : t));

    try {
      const { error: messageError } = await supabase
        .from('internal_messages')
        .insert({
          ticket_id: ticket.id,
          text: transferText,
          sender_id: currentUser.id,
          sender_name: currentUser.name,
          department_name: transferMessage.departmentName
        });

      if (messageError) throw messageError;

      const { error: ticketError } = await supabase
        .from('tickets')
        .update({
          department_id: targetDept.id,
          assigned_to: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticket.id);

      if (ticketError) throw ticketError;

      setPendingTransfer(null);
      setTransferSuccessMessage(`${ticketCustomer?.name || 'Cliente'} enviado para ${targetDept.name}.`);
      window.setTimeout(() => setTransferSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error moving ticket:', error);
      alert('Erro ao mover ticket.');
      fetchData(false);
    } finally {
      setTransferSubmitting(false);
    }
  };
  const QuoteIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
  );

  const getStatusIcon = (status: TicketStatus) => {
    switch (status) {
      case 'Novo': return <CircleDot className="w-4 h-4 text-blue-500" />;
      case 'Orçamento': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'Projeto': return <SparklesIcon className="w-4 h-4 text-purple-500" />;
      case 'Produção': return <Hammer className="w-4 h-4 text-orange-500" />;
      case 'Instalação': return <Truck className="w-4 h-4 text-indigo-500" />;
      case 'Finalizado': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
  };

  const SparklesIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
  );

  const renderMessageText = (text: string) => {
    const normalizedText = text
      .replace(/^[^\[]*\[AUDIO\]/, '[AUDIO]')
      .replace(/^[^\[]*\[IMAGE\]/, '[IMAGE]')
      .replace(/^[^\[]*\[VIDEO\]/, '[VIDEO]')
      .replace(/^[^\[]*\[FILE\]/, '[FILE]');

    const renderExpiredMedia = () => (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Mídia temporária expirada.
      </div>
    );

    if (normalizedText.startsWith('[AUDIO]')) {
      const url = normalizedText.replace('[AUDIO]', '');
      if (url.startsWith('blob:')) return renderExpiredMedia();
      return (
        <div className="flex flex-col gap-2 py-1 min-w-[240px]">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-wider">
            <Mic className="w-3 h-3" /> Mensagem de áudio
          </div>
          <audio controls className="h-10 w-full">
            <source src={url} type="audio/mpeg" />
          </audio>
        </div>
      );
    }
    if (normalizedText.startsWith('[IMAGE]')) {
      const url = normalizedText.replace('[IMAGE]', '');
      if (url.startsWith('blob:')) return renderExpiredMedia();
      return (
        <div className="flex flex-col gap-2 py-1">
          <img src={url} alt="Imagem do cliente" className="max-w-full rounded-lg shadow-sm border border-slate-100" referrerPolicy="no-referrer" />
        </div>
      );
    }
    if (normalizedText.startsWith('[VIDEO]')) {
      const url = normalizedText.replace('[VIDEO]', '');
      if (url.startsWith('blob:')) return renderExpiredMedia();
      return (
        <div className="flex flex-col gap-2 py-1">
          <video controls className="max-w-full rounded-lg shadow-sm border border-slate-100">
            <source src={url} type="video/mp4" />
          </video>
        </div>
      );
    }
    if (normalizedText.startsWith('[FILE]')) {
      const url = normalizedText.replace('[FILE]', '');
      if (url.startsWith('blob:')) return renderExpiredMedia();
      const fileName = url.split('/').pop() || 'arquivo';
      return (
        <div className="flex flex-col gap-2 py-1">
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white/50 p-3 rounded-lg border border-slate-200 hover:bg-white transition-colors group"
          >
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium text-slate-700 truncate">{fileName}</span>
              <span className="text-[10px] text-slate-400 uppercase">Documento</span>
            </div>
          </a>
        </div>
      );
    }
    return text;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          aria-label="Alternar tema"
          title={isDarkMode ?'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {isDarkMode ?<Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Iniciando sistema seguro...</p>
        </div>
      </div>
    );
  }

  if (!session || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          aria-label="Alternar tema"
          title={isDarkMode ?'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {isDarkMode ?<Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-slate-200 border border-slate-100 overflow-hidden">
              <img src={officialLogoPath} alt="DCoratto" className="w-full h-full object-contain p-2" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">DCoratto</h1>
            <p className="text-slate-400 text-sm">Estrutura robusta de atendimento</p>
          </div>

          <form onSubmit={authMode === 'login' ?handleLogin : handleSignUp} className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs font-medium">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">E-mail</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-indigo-600 transition-all text-sm"
                  placeholder="usuario@empresa.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-indigo-600 transition-all text-sm"
                  placeholder="????????"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98] disabled:opacity-50 mt-4"
            >
              {authSubmitting ?"Processando..." : (authMode === 'login' ?"Entrar na Conta" : "Criar Minha Conta")}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-50 flex flex-col items-center gap-4">
            <button 
              onClick={() => {
                setAuthError(null);
                setAuthMode(authMode === 'login' ?'signup' : 'login');
              }}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              {authMode === 'login' ? "Ainda não tem conta? Cadastrar" : "Já tem uma conta? Entrar"}
            </button>
            <div className="flex items-center gap-2 text-[10px] text-slate-300 font-bold uppercase tracking-widest">
              <ShieldCheck className="w-3 h-3" /> Conexão Segura Supabase
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="fixed top-4 right-4 z-[80] p-2 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
        aria-label="Alternar tema"
        title={isDarkMode ?'Ativar tema claro' : 'Ativar tema escuro'}
      >
        {isDarkMode ?<Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      {/* Sidebar Navigation */}
      <aside className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-8 relative">
        {!isOnline && (
          <div className="absolute top-0 left-0 w-full h-full bg-slate-900/10 backdrop-blur-[1px] z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-red-500 text-white p-1 rounded-full animate-pulse">
              <WifiOff className="w-4 h-4" />
            </div>
          </div>
        )}
        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-200 border border-slate-100 overflow-hidden">
          <img src={officialLogoPath} alt="DCoratto" className="w-full h-full object-contain p-1.5" />
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          <div className="mb-4 flex flex-col items-center gap-1">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shadow-sm border-2",
              whatsapp.status === 'connected' ?"bg-green-50 border-green-200 text-green-600" : "bg-red-50 border-red-200 text-red-600"
            )}>
              <Phone className="w-5 h-5" />
            </div>
            <span className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter">WA Ativo</span>
          </div>

          <button 
            onClick={() => setActiveTab('tickets')}
            title="Atendimentos"
            className={cn(
              "p-3 rounded-xl transition-all",
              activeTab === 'tickets' ?"bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            )}
          >
            <MessageSquare className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setActiveTab('customers')}
            title="Clientes"
            className={cn(
              "p-3 rounded-xl transition-all",
              activeTab === 'customers' ?"bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            )}
          >
            <Users className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            title="Dashboard"
            className={cn(
              "p-3 rounded-xl transition-all",
              activeTab === 'dashboard' ?"bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            )}
          >
            <LayoutDashboard className="w-6 h-6" />
          </button>
          {canAccessSystemSettings && (
            <button 
              onClick={() => setActiveTab('admin')}
              title="Configurações do Sistema"
              className={cn(
                "p-3 rounded-xl transition-all",
                activeTab === 'admin' ?"bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              )}
            >
              <ShieldCheck className="w-6 h-6" />
            </button>
          )}
        </nav>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-auto">
          {canAccessSystemSettings && (
            <button 
              onClick={handleSettings}
              className={cn(
                "p-3 rounded-xl transition-all",
                activeTab === 'admin' ?"bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
              )}
              title="Configurações"
            >
              <Settings className="w-6 h-6" />
            </button>
          )}
          
          <button 
            onClick={handleLogout}
            className="p-3 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
            title="Sair"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </aside>

      {/* Conditional Content Based on Tab */}
      {activeTab === 'tickets' && (
        <>
          {/* Ticket List */}
          <section className="w-80 bg-white border-r border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold">Atendimentos</h1>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fetchData(false)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Atualizar dados"
                  >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  </button>
                  <div className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-2 py-1 rounded uppercase">
                    {currentUser?.departmentId ?departments.find(d => d.id === currentUser.departmentId)?.name : 'Todos'}
                  </div>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar conversas..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sortedTickets.map(ticket => {
                const ticketCustomer = customers.find(c => c.id === ticket.customerId);
                const departmentAccent = getDepartmentAccent(ticket.departmentId);
                const meta = conversationMeta[ticket.id];
                const unreadCount = meta?.unreadCount || 0;
                const isUnread = unreadCount > 0 || !!meta?.markedUnread;
                const isPinned = !!meta?.pinned;
                return (
                  <div
                    key={ticket.id}
                    style={{ borderLeftColor: departmentAccent.border }}
                    className={cn(
                      "relative w-full p-4 flex flex-col gap-1 border-b border-l-4 border-slate-50 transition-colors text-left group",
                      selectedTicketId === ticket.id ?"bg-indigo-50/50" : isUnread ?"bg-emerald-50/40 hover:bg-emerald-50/70" : "hover:bg-slate-50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectTicket(ticket.id)}
                      className="w-full text-left"
                    >
                      <div className="flex justify-between items-start gap-2 pr-7">
                        <span className={cn("text-sm truncate", isUnread ?"font-black text-slate-900" : "font-semibold text-slate-700")}>
                          {ticketCustomer?.name}
                        </span>
                        <span className={cn("text-[10px] shrink-0", isUnread ?"font-bold text-emerald-600" : "text-slate-400")}>
                          {format(ticket.updatedAt, 'HH:mm')}
                        </span>
                      </div>
                      <div className={cn("text-xs truncate pr-8", isUnread ?"text-slate-700 font-bold" : "text-slate-500 font-medium")}>
                        {ticket.lastMessage || ticket.title}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider"
                          style={{ backgroundColor: departmentAccent.bg, color: departmentAccent.text }}
                        >
                          <CircleDot className="w-3 h-3" />
                          {departments.find(d => d.id === ticket.departmentId)?.name || ticket.status}
                        </span>
                        {isPinned && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-black uppercase">
                            Fixada
                          </span>
                        )}
                      </div>
                    </button>

                    {unreadCount > 0 && (
                      <div className="absolute right-4 top-10 min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                        {unreadCount > 9 ?'9+' : unreadCount}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenTicketMenuId(openTicketMenuId === ticket.id ?null : ticket.id);
                      }}
                      className="absolute right-3 top-3 p-1.5 rounded-lg text-slate-300 hover:text-slate-700 hover:bg-white/80 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Opções da conversa"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {openTicketMenuId === ticket.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          className="absolute right-3 top-10 z-40 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              markConversationUnread(ticket.id);
                              setOpenTicketMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Marcar como não lido
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              togglePinnedConversation(ticket.id);
                              setOpenTicketMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            {isPinned ?'Desfixar conversa' : 'Fixar conversa no topo'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenTicketMenuId(null);
                              handleMoveToNextDept(ticket.id);
                            }}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                          >
                            Transferir conversa
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Main Chat Area Split */}
          <main className="flex-1 flex flex-col bg-white min-w-0">
            {selectedTicket ?(
              <div className="flex-1 flex h-full overflow-hidden">
                {/* Customer Chat Column */}
                <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">
                  {/* Chat Header */}
                  <header className="h-20 border-b border-slate-100 px-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
                        {customer?.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="font-bold text-sm truncate max-w-[150px]">{customer?.name}</h2>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Phone className="w-2.5 h-2.5" /> {customer?.phone}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-500 shadow-sm">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        {canManageTicketAssignment(selectedTicket) ?(
                          <select
                            value={selectedTicket.assignedTo || ''}
                            onChange={(e) => handleAssignTicket(selectedTicket.id, e.target.value || null)}
                            className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-700"
                            title="Atribuir cliente"
                          >
                            <option value="">{getDepartmentManagerTitle(selectedTicket.departmentId)}</option>
                            {getDepartmentCollaborators(selectedTicket.departmentId).map(user => (
                              <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-700">{getTicketAssigneeName(selectedTicket)}</span>
                        )}
                      </div>
                      {canSelfAssignTicket(selectedTicket) && (
                        <button
                          type="button"
                          onClick={() => handleAssignTicket(selectedTicket.id, currentUser?.id || null)}
                          className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                          title="Assumir este cliente para poder enviar mensagens"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Assumir
                        </button>
                      )}
                      <div className="flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5 shadow-sm">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={selectedTicket.departmentId}
                          onChange={(e) => requestDepartmentTransfer(selectedTicket.id, e.target.value)}
                          disabled={!canInteractWithTicket(selectedTicket)}
                          className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-700 disabled:opacity-40"
                          title="Enviar para departamento"
                        >
                          {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleMoveToNextDept(selectedTicket.id)}
                        disabled={!canInteractWithTicket(selectedTicket)}
                        title="Enviar ao proximo departamento"
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowRightCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </header>

                  {/* Customer Messages */}
                  <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-slate-50/20"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chat com Cliente</span>
                      <button 
                        onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold transition-all border",
                          showFlaggedOnly 
                            ?"bg-amber-50 text-amber-600 border-amber-200" 
                            : "bg-white text-slate-400 border-slate-200"
                        )}
                      >
                        <Flag className={cn("w-2.5 h-2.5", showFlaggedOnly && "fill-amber-600")} />
                        {showFlaggedOnly ?"Ver Todas" : "Ver Marcadas"}
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {selectedTicket.messages
                        .filter(msg => !showFlaggedOnly || msg.isFlagged)
                        .map((msg) => (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={msg.id}
                            className={cn(
                              "flex flex-col max-w-[85%] group",
                              msg.sender === 'customer' ?"self-start" : "self-end items-end"
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {msg.isFlagged && (
                                <div className="flex items-center gap-1 text-[8px] font-bold text-amber-600 uppercase bg-amber-50 px-1.5 py-0.5 rounded">
                                  <Flag className="w-2.5 h-2.5 fill-amber-600" /> Marcada
                                </div>
                              )}
                            </div>
                            <div className="relative">
                              <div className={cn(
                                "px-3 py-2 rounded-2xl text-xs shadow-sm",
                                msg.sender === 'customer' 
                                  ?"bg-white text-slate-800 rounded-tl-none border border-slate-100" 
                                  : "bg-indigo-600 text-white rounded-tr-none"
                              )}>
                                {renderMessageText(msg.text)}
                              </div>
                              
                              {/* Actions */}
                              <div className={cn(
                                "absolute top-0 flex gap-1 transition-all opacity-0 group-hover:opacity-100",
                                msg.sender === 'customer' ?"-right-16" : "-left-16"
                              )}>
                                <button 
                                  onClick={() => handleFlagMessage(selectedTicket.id, msg.id)}
                                  className={cn(
                                    "p-1.5 bg-white rounded-full shadow-md border border-slate-100 hover:text-amber-500",
                                    msg.isFlagged && "text-amber-500"
                                  )}
                                  title="Marcar para próximos setores"
                                >
                                  <Flag className={cn("w-3 h-3", msg.isFlagged && "fill-amber-500")} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setQuotedMessageId(msg.id);
                                    // Scroll to internal input
                                  }}
                                  className="p-1.5 bg-white rounded-full shadow-md border border-slate-100 hover:text-indigo-600"
                                  title="Citar no chat interno"
                                >
                                  <QuoteIcon className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <span className="text-[9px] text-slate-400 mt-1 px-1">
                              {format(msg.timestamp, 'HH:mm')}
                            </span>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>

                  {/* Customer Input Area */}
                  <footer className="p-4 border-t border-slate-100 shrink-0">
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (recordingStatus !== 'idle') {
                          stopRecording();
                        } else if (inputMessage.trim()) {
                          handleSendMessage(e, false);
                        } else {
                          startRecording();
                        }
                      }}
                      className="flex items-center gap-3 bg-slate-100 rounded-xl p-1.5 pl-3"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileUpload}
                      />
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!canInteractWithTicket(selectedTicket)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <input 
                        type="text" 
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder={recordingStatus !== 'idle' ?"Gravando áudio..." : "Mensagem para o cliente..."} 
                        className="flex-1 bg-transparent border-none outline-none text-xs py-1.5"
                        disabled={recordingStatus !== 'idle' || !canInteractWithTicket(selectedTicket)}
                      />
                      {recordingStatus !== 'idle' && (
                        <div className="flex items-center gap-1 mr-1">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mr-1" />
                          <button 
                            type="button"
                            onClick={recordingStatus === 'recording' ?pauseRecording : resumeRecording}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title={recordingStatus === 'recording' ?"Pausar" : "Continuar"}
                          >
                            {recordingStatus === 'recording' ?<Clock className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            type="button"
                            onClick={cancelRecording}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Cancelar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <button 
                        type="submit"
                        disabled={!canInteractWithTicket(selectedTicket)}
                        className={cn(
                          "p-2 rounded-lg transition-all transform active:scale-95",
                          !canInteractWithTicket(selectedTicket) ?"bg-slate-200 text-slate-400 cursor-not-allowed" :
                          recordingStatus !== 'idle' ?"bg-red-600 text-white hover:bg-red-700" : 
                          inputMessage.trim() ?"bg-indigo-600 text-white hover:bg-indigo-700 shadow-md" : 
                          "bg-slate-200 text-slate-500 hover:bg-slate-300"
                        )}
                        title={recordingStatus !== 'idle' ?"Enviar áudio" : inputMessage.trim() ?"Enviar Mensagem" : "Gravar áudio"}
                      >
                        {recordingStatus !== 'idle' || inputMessage.trim() ?(
                          <Send className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>
                    </form>
                  </footer>
                </div>

                {/* Internal Chat Column */}
                <div className="w-80 flex flex-col bg-amber-50/30 border-r border-slate-100 min-w-0">
                  <header className="h-20 border-b border-amber-100 px-6 flex items-center justify-between shrink-0 bg-amber-50/50">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-600" />
                      <h2 className="font-bold text-sm text-amber-800 uppercase tracking-wider">Chat Interno</h2>
                    </div>
                    <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                      <Users className="w-4 h-4" />
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-3 h-3 text-amber-500" />
                      <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Anotações e Equipe</span>
                    </div>

                    <AnimatePresence initial={false}>
                      {selectedTicket.internalMessages.map((msg) => {
                        const quotedMsg = msg.quotedMessageId ?selectedTicket.messages.find(m => m.id === msg.quotedMessageId) : null;
                        const transferDepartmentName = getTransferDepartmentName(msg.text);
                        const departmentAccent = getDepartmentAccent(transferDepartmentName || msg.departmentName);
                        const isTransferMessage = !!transferDepartmentName;
                        return (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={msg.id}
                            className="flex flex-col w-full group"
                          >
                            <div className={cn(
                              "bg-white border border-l-4 border-amber-100 p-3 rounded-2xl shadow-sm relative",
                              isTransferMessage && "rounded-xl",
                              msg.isFlagged && "border-amber-400 ring-1 ring-amber-400"
                            )}
                              style={isTransferMessage ?{
                                borderLeftColor: departmentAccent.border,
                                backgroundColor: departmentAccent.bg
                              } : {
                                borderLeftColor: msg.departmentName ?departmentAccent.border : '#fcd34d'
                              }}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex flex-col">
                                  <span
                                    className="text-[9px] font-bold flex items-center gap-1"
                                    style={{ color: isTransferMessage ?departmentAccent.text : undefined }}
                                  >
                                    {isTransferMessage ?<ArrowRightCircle className="w-2.5 h-2.5" /> : <AtSign className="w-2.5 h-2.5" />}
                                    {isTransferMessage ?`Transferência para ${transferDepartmentName}` : msg.senderName}
                                  </span>
                                  {msg.departmentName && (
                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">
                                      Setor: {msg.departmentName}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[8px] text-amber-400">{format(msg.timestamp, 'HH:mm')}</span>
                              </div>
                              
                              {quotedMsg && (
                                <div className="mb-2 p-2 bg-slate-50 border-l-2 border-slate-300 rounded text-[10px] text-slate-500 italic">
                                  "{quotedMsg.text.substring(0, 50)}{quotedMsg.text.length > 50 ?'...' : ''}"
                                </div>
                              )}
                              
                              <div className={cn("text-xs leading-relaxed", isTransferMessage ?"font-semibold" : "text-amber-900")}>
                                {renderMessageText(msg.text)}
                              </div>

                              {/* Flag Action for Internal */}
                              <button 
                                onClick={() => handleFlagMessage(selectedTicket.id, msg.id, true)}
                                className={cn(
                                  "absolute -right-2 -top-2 p-1 bg-white rounded-full shadow-md border border-amber-100 opacity-0 group-hover:opacity-100 transition-all",
                                  msg.isFlagged && "opacity-100 text-amber-500"
                                )}
                              >
                                <Flag className={cn("w-2.5 h-2.5", msg.isFlagged && "fill-amber-500")} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* Internal Input Area */}
                  <footer className="p-4 border-t border-amber-100 bg-amber-50/50 shrink-0">
                    {quotedMessageId && (
                      <div className="mb-2 p-2 bg-white border border-amber-100 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <QuoteIcon className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="text-[9px] text-slate-500 truncate italic">
                            Respondendo à mensagem do cliente...
                          </span>
                        </div>
                        <button onClick={() => setQuotedMessageId(null)} className="text-slate-400 hover:text-slate-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <form 
                      onSubmit={(e) => handleSendMessage(e, true)}
                      className="flex items-center gap-3 bg-white border border-amber-200 rounded-xl p-1.5 pl-3 shadow-sm"
                    >
                      <input 
                        type="text" 
                        value={internalInputMessage}
                        onChange={(e) => setInternalInputMessage(e.target.value)}
                        placeholder="Nota interna ou @alguém..." 
                        className="flex-1 bg-transparent border-none outline-none text-xs py-1.5"
                        disabled={!canSendInternalMessage(selectedTicket)}
                      />
                      <button 
                        type="submit"
                        disabled={!internalInputMessage.trim() || !canSendInternalMessage(selectedTicket)}
                        className="bg-amber-600 text-white p-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    </form>
                  </footer>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-10 h-10" />
                </div>
                <p>Selecione uma conversa para começar</p>
              </div>
            )}
          </main>

          {/* Customer Details Sidebar */}
          {selectedTicket && (
            <aside className="w-80 border-l border-slate-200 bg-white overflow-y-auto hidden xl:block">
              {/* Sidebar Tabs */}
              <div className="flex border-b border-slate-100">
                <button 
                  onClick={() => setRightSidebarTab('details')}
                  className={cn(
                    "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all",
                    rightSidebarTab === 'details' ?"text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Atendimento
                </button>
                <button 
                  onClick={() => setRightSidebarTab('documents')}
                  className={cn(
                    "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all relative",
                    rightSidebarTab === 'documents' ?"text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Documentos
                </button>
              </div>

              <div className="p-8">
                {rightSidebarTab === 'details' ?(
                  <>
                    <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 text-2xl font-bold mb-4">
                    {customer?.name.charAt(0)}
                  </div>
                  <h2 className="text-xl font-bold">{customer?.name}</h2>
                  <p className="text-sm text-slate-400">{customer?.phone}</p>
                </div>

                {/* Flagged Messages (Project Details) */}
                <div className="mb-8">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Flag className="w-3 h-3 text-amber-500 fill-amber-500" /> Detalhes Marcados (Esteira)
                  </h3>
                  <div className="space-y-3">
                    {/* Combine flagged customer and internal messages */}
                    {[
                      ...selectedTicket.messages.filter(m => m.isFlagged).map(m => ({ ...m, type: 'customer' })),
                      ...selectedTicket.internalMessages.filter(m => m.isFlagged).map(m => ({ ...m, type: 'internal' }))
                    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).length > 0 ?(
                      [
                        ...selectedTicket.messages.filter(m => m.isFlagged).map(m => ({ ...m, type: 'customer' })),
                        ...selectedTicket.internalMessages.filter(m => m.isFlagged).map(m => ({ ...m, type: 'internal' }))
                      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map(msg => (
                        <div key={msg.id} className={cn(
                          "p-3 rounded-xl relative border",
                          msg.type === 'customer' ?"bg-white border-slate-100" : "bg-amber-50 border-amber-100"
                        )}>
                          <div className="flex items-center gap-1.5 mb-1">
                            {msg.type === 'internal' && <Lock className="w-2.5 h-2.5 text-amber-600" />}
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{msg.type === 'customer' ?'Cliente' : 'Interno'}</p>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{msg.text}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[8px] font-bold text-indigo-600 uppercase">Por {msg.flaggedBy}</span>
                            <span className="text-[8px] text-slate-400">{format(msg.timestamp, 'dd/MM')}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center">
                        <p className="text-[10px] text-slate-400 italic">Nenhum detalhe marcado para este projeto ainda.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Informações de Contato</h3>
                      <button 
                        onClick={() => {
                          if (editingCustomer) {
                            handleUpdateCustomer();
                          } else {
                            setEditingCustomer(customer?.id || null);
                            setEditCustomerData({
                              name: customer?.name,
                              email: customer?.email,
                              address: customer?.address,
                              phone: customer?.phone
                            });
                          }
                        }}
                        className="text-indigo-600 hover:text-indigo-700"
                      >
                        {editingCustomer ?<Save className="w-3.5 h-3.5" /> : <Edit className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {editingCustomer ?(
                        <div className="space-y-2">
                          <input 
                            className="w-full text-xs p-2 border rounded" 
                            value={editCustomerData.name} 
                            onChange={e => setEditCustomerData({...editCustomerData, name: e.target.value})}
                            placeholder="Nome"
                          />
                          <input 
                            className="w-full text-xs p-2 border rounded" 
                            value={editCustomerData.email} 
                            onChange={e => setEditCustomerData({...editCustomerData, email: e.target.value})}
                            placeholder="E-mail"
                          />
                          <input 
                            className="w-full text-xs p-2 border rounded" 
                            value={editCustomerData.phone} 
                            onChange={e => setEditCustomerData({...editCustomerData, phone: e.target.value})}
                            placeholder="Telefone"
                          />
                          <textarea 
                            className="w-full text-xs p-2 border rounded" 
                            value={editCustomerData.address} 
                            onChange={e => setEditCustomerData({...editCustomerData, address: e.target.value})}
                            placeholder="Endereço"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 text-sm">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600">{customer?.email || 'Nenhum e-mail'}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600">{customer?.phone}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600 leading-tight">{customer?.address || 'Nenhum endereço'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Progresso na Esteira</h3>
                    <div className="space-y-4">
                      {departments.map((dept, idx) => {
                        const isCurrent = dept.id === selectedTicket.departmentId;
                        const isPast = departments.findIndex(d => d.id === selectedTicket.departmentId) > idx;
                        
                        return (
                          <div key={dept.id} className="flex items-center gap-3">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                              isCurrent ?"bg-indigo-600 border-indigo-600 text-white" : 
                              isPast ?"bg-green-500 border-green-500 text-white" : 
                              "bg-white border-slate-200 text-slate-300"
                            )}>
                              {isPast ?<CheckCircle2 className="w-3 h-3" /> : idx + 1}
                            </div>
                            <span className={cn(
                              "text-xs font-bold",
                              isCurrent ?"text-indigo-600" : isPast ?"text-slate-600" : "text-slate-300"
                            )}>
                              {dept.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
                  <div className="space-y-6">
                    {/* Requirements for current department */}
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3 text-indigo-600" /> Requisitos do Setor
                      </h3>
                      <div className="space-y-3">
                        {(() => {
                          const dept = departments.find(d => d.id === selectedTicket.departmentId);
                          const requirements = dept?.requiredDocuments || [];
                          
                          if (requirements.length === 0) {
                            return <p className="text-[10px] text-slate-400 italic">Este setor não exige documentos obrigatórios.</p>;
                          }

                          return requirements.map(req => {
                            const isUploaded = selectedTicket.documents?.some(doc => doc.name === req);
                            const uploadedFile = selectedTicket.documents?.find(doc => doc.name === req);

                            return (
                              <div key={req} className={cn(
                                "p-3 rounded-xl border flex flex-col gap-2 transition-all",
                                isUploaded ?"bg-green-50 border-green-100" : "bg-red-50/30 border-red-100"
                              )}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {isUploaded ?<CheckCircle2 className="w-3 h-3 text-green-600" /> : <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />}
                                    <span className="text-[11px] font-bold text-slate-700">{req}</span>
                                  </div>
                                  {!isUploaded && (
                                    <label className="cursor-pointer bg-white text-slate-600 px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold hover:bg-slate-50">
                                      Anexar
                                      <input type="file" className="hidden" onChange={(e) => handleUploadDocument(e, req)} />
                                    </label>
                                  )}
                                </div>
                                {isUploaded && uploadedFile && (
                                  <div className="flex items-center justify-between bg-white/50 p-1.5 rounded-lg border border-green-100">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                      <FileText className="w-3 h-3 text-slate-400" />
                                      <span className="text-[9px] text-slate-500 truncate">{uploadedFile.fileUrl.split('/').pop()}</span>
                                    </div>
                                    <a href={uploadedFile.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold text-[9px] uppercase tracking-tighter">Ver</a>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* All Documents Folder */}
                    <div className="pt-6 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <Folder className="w-3 h-3 text-indigo-500" /> Pasta de Arquivos
                        </h3>
                        <label className="cursor-pointer text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Novo</span>
                          <input type="file" className="hidden" onChange={(e) => handleUploadDocument(e)} />
                        </label>
                      </div>

                      <div className="space-y-2">
                        {departments.map(dept => {
                          const deptDocs = selectedTicket.documents?.filter(doc => doc.departmentId === dept.id) || [];
                          if (deptDocs.length === 0) return null;

                          return (
                            <div key={dept.id} className="space-y-1">
                              <div className="px-2 py-1 bg-slate-50 rounded text-[8px] font-black text-slate-400 uppercase tracking-tighter w-fit">
                                {dept.name}
                              </div>
                              {deptDocs.map(doc => (
                                <div key={doc.id} className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 rounded-lg group transition-colors">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                    <span className="text-[10px] text-slate-600 truncate">{doc.name}</span>
                                  </div>
                                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600 transition-colors">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        {(!selectedTicket.documents || selectedTicket.documents.length === 0) && (
                          <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                            <Folder className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                            <p className="text-[10px] text-slate-300 font-medium">Pasta vazia</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </>
      )}

      {activeTab === 'customers' && (
        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-2xl font-bold">Base de Clientes</h1>
              <button 
                onClick={handleAddCustomer}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Novo Cliente
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleCustomers.map(c => (
                <div key={c.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg">
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold">{c.name}</h3>
                      <p className="text-xs text-slate-400">{c.phone}</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Mail className="w-3 h-3" /> {c.email}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPin className="w-3 h-3" /> {c.address}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleViewCustomerHistory(c.id)}
                    className="w-full py-2 text-indigo-600 text-xs font-bold border border-indigo-100 rounded-lg hover:bg-indigo-50"
                  >
                    Ver Histórico Completo
                  </button>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {activeTab === 'admin' && (
        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">Configurações do Sistema</h1>
            <p className="text-sm text-slate-500 mb-8">
              Gestão de departamentos com ordem de fluxo, colaboradores e conexão do WhatsApp por QR Code ou número.
            </p>
            
            {/* Invite Collaborator Section */}
            <div className="mb-10 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MailPlus className="w-5 h-5 text-indigo-600" /> Convidar Colaborador
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Envie um convite por e-mail para novos membros da equipe.</p>
                </div>
              </div>
              
              <form onSubmit={handleSendInvite} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                <div className="md:col-span-5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">E-mail do Colaborador</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="exemplo@empresa.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Departamento</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select 
                      value={inviteDept}
                      onChange={(e) => setInviteDept(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm appearance-none"
                    >
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <button 
                    type="submit"
                    disabled={!inviteEmail.trim()}
                    className="w-full bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Enviar Convite
                  </button>
                </div>
              </form>

              {invitations.length > 0 && (
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Convites Pendentes</h3>
                  <div className="space-y-3">
                    {invitations.map(invite => (
                      <div key={invite.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-200">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">{invite.email}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-indigo-600 font-bold uppercase">
                                {departments.find(d => d.id === invite.departmentId)?.name}
                              </span>
                              <span className="text-[10px] text-slate-400">?</span>
                              <span className="text-[10px] text-slate-400">Enviado em {format(invite.createdAt, 'dd/MM/yyyy')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleAcceptInvite(invite)}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3 h-3" /> Simular Aceite
                          </button>
                          <button 
                            onClick={() => setInvitations(invitations.filter(i => i.id !== invite.id))}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Department Management Section */}
            <div className="mb-10 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600" /> Gestão de Departamentos e Esteira
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Defina a ordem dos setores e gerencie os departamentos da empresa.</p>
                </div>
                <button 
                  onClick={() => setIsAddingDept(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Novo Setor
                </button>
              </div>

              <div className="space-y-3">
                {isAddingDept && (
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-indigo-400 border border-indigo-200 shadow-sm">
                        +
                      </div>
                      <input 
                        className="flex-1 text-sm font-bold bg-white border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Nome do novo setor..."
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddDepartment()}
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button 
                        onClick={handleAddDepartment}
                        className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                        title="Confirmar"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setIsAddingDept(false);
                          setNewDeptName('');
                        }}
                        className="p-2 bg-white text-slate-400 border border-slate-200 rounded-lg hover:text-red-600 transition-all"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                {departments.map((dept, idx) => (
                  <div key={dept.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-200 shadow-sm">
                        {idx + 1}
                      </div>
                      <div>
                        {editingDept === dept.id ?(
                          <div className="flex items-center gap-2">
                            <input 
                              className="text-sm font-bold bg-white border border-indigo-200 rounded px-2 py-1 outline-none"
                              value={editDeptName}
                              onChange={e => setEditDeptName(e.target.value)}
                              autoFocus
                            />
                            <button onClick={handleUpdateDept} className="text-green-600 hover:text-green-700">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingDept(null)} className="text-slate-400 hover:text-slate-500">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700">{dept.name}</span>
                              <button 
                                onClick={() => {
                                  setEditingDept(dept.id);
                                  setEditDeptName(dept.name);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 transition-all"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                            
                            {/* Required Documents Section */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {dept.requiredDocuments?.map(req => (
                                <span key={req} className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold uppercase tracking-tighter">
                                  {req}
                                  <button 
                                    onClick={() => handleUpdateDeptRequirements(dept.id, dept.requiredDocuments!.filter(r => r !== req))}
                                    className="hover:text-red-500"
                                  >
                                    <X className="w-2 h-2" />
                                  </button>
                                </span>
                              ))}
                              <div className="flex items-center gap-1 ml-1">
                                <input 
                                  className="text-[9px] py-0.5 px-1.5 border border-slate-200 rounded outline-none focus:border-indigo-400 w-24"
                                  placeholder="+ Novo documento"
                                  value={newReqDoc}
                                  onChange={e => setNewReqDoc(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && newReqDoc.trim()) {
                                      handleUpdateDeptRequirements(dept.id, [...(dept.requiredDocuments || []), newReqDoc.trim()]);
                                      setNewReqDoc('');
                                    }
                                  }}
                                />
                                {newReqDoc.trim() && (
                                  <button 
                                    onClick={() => {
                                      handleUpdateDeptRequirements(dept.id, [...(dept.requiredDocuments || []), newReqDoc.trim()]);
                                      setNewReqDoc('');
                                    }}
                                    className="text-indigo-600 hover:text-indigo-700"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleUpdateDeptOrder(dept.id, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg disabled:opacity-30 transition-all"
                      >
                        <ChevronRight className="w-4 h-4 -rotate-90" />
                      </button>
                      <button 
                        onClick={() => handleUpdateDeptOrder(dept.id, 'down')}
                        disabled={idx === departments.length - 1}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg disabled:opacity-30 transition-all"
                      >
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </button>
                      <button 
                        onClick={() => handleDeleteDepartment(dept.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {departments.length === 0 && (
                  <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                    <p className="text-sm text-slate-400">Nenhum departamento cadastrado.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Supabase Connection Section */}
            <div className="mb-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" /> Status do Banco de Dados (Supabase)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Verifique a conexão com o banco de dados real.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setSupabaseStatus('checking');
                      fetchData(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Recarregar dados"
                  >
                    <RefreshCw className={cn("w-4 h-4", supabaseStatus === 'checking' && "animate-spin")} />
                  </button>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5",
                    supabaseStatus === 'connected' ?"bg-green-100 text-green-700" : 
                    supabaseStatus === 'checking' ?"bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  )}>
                    {supabaseStatus === 'connected' ?<CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {supabaseStatus === 'connected' ?'Conectado' : supabaseStatus === 'checking' ?'Verificando...' : 'Erro de Conexão'}
                  </div>
                </div>
              </div>
              {supabaseStatus === 'error' && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs">
                  <p className="font-bold mb-1">Erro ao conectar com Supabase!</p>
                  <p className="mb-2">{supabaseError || 'Erro desconhecido.'}</p>
                  <p>Certifique-se de que:</p>
                  <ul className="list-disc ml-4 mt-1 space-y-1">
                    <li>Você configurou <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> nos Secrets.</li>
                    <li>O código SQL foi executado com sucesso no Supabase.</li>
                    <li>As tabelas <b>departments</b>, <b>customers</b>, <b>tickets</b>, etc., existem.</li>
                  </ul>
                </div>
              )}
              {supabaseStatus === 'connected' && departments.length === 0 && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs">
                  <p className="font-bold mb-1">Atenção: Nenhuma configuração encontrada!</p>
                  <p>O banco de dados está conectado, mas a tabela de <b>departamentos</b> está vazia. Rode o código SQL novamente para inserir os dados iniciais.</p>
                </div>
              )}
            </div>

            {/* WhatsApp Connection Section */}
            <div className="mb-10 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" /> Conexão WhatsApp (Sem Meta API)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Escaneie o QR Code para conectar seu WhatsApp pessoal/empresa.</p>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5",
                  waStatus === 'connected' ?"bg-green-100 text-green-700" : 
                  waStatus === 'connecting' ?"bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                )}>
                  {waStatus === 'connected' ?<Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {waStatus === 'connected' ?'Conectado' : waStatus === 'connecting' ?'Aguardando QR' : 'Desconectado'}
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-stretch gap-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex flex-col gap-6">
                  {waStatus !== 'connected' && waQR ?(
                    <div className="flex flex-col items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                      <img src={waQR} alt="WhatsApp QR Code" className="w-48 h-48" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Escaneie com seu WhatsApp</p>
                    </div>
                  ) : waStatus === 'connected' ?(
                    <div className="w-48 h-48 bg-green-50 rounded-2xl border border-green-100 flex flex-col items-center justify-center text-green-600 gap-2">
                      <CheckCircle2 className="w-12 h-12" />
                      <p className="text-xs font-bold uppercase">Conectado!</p>
                    </div>
                  ) : (
                    <div className="w-48 h-48 bg-slate-100 rounded-2xl border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                      <p className="text-[10px] font-bold uppercase">Gerando QR Code...</p>
                    </div>
                  )}

                  {waStatus !== 'connected' && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-3 text-center">Ou conecte via número</p>
                      {waPairingCode ?(
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-2xl font-mono font-bold tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
                            {waPairingCode}
                          </div>
                          <p className="text-[9px] text-slate-400 text-center px-2">Digite este código no seu celular após clicar em "Conectar com número de telefone"</p>
                          <button 
                            onClick={() => setWaPairingCode(null)}
                            className="text-[9px] text-indigo-600 font-bold hover:underline mt-1"
                          >
                            Tentar outro número
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <input 
                            type="text" 
                            placeholder="Ex: 5511999998888"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            className="text-xs p-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button 
                            onClick={handleRequestPairingCode}
                            disabled={isRequestingPair || !pairingPhone.trim()}
                            className="bg-indigo-600 text-white py-2 rounded-lg text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                          >
                            {isRequestingPair ?<RefreshCw className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                            Gerar Código
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {waMaxReached && waStatus !== 'connected' && (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-700 mb-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold mb-1">Conexão Suspensa</p>
                        <p className="text-[10px] leading-relaxed">O WhatsApp parou de gerar códigos automaticamente após várias tentativas. Clique no botão abaixo para reiniciar o processo.</p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status da Conexão</p>
                  <h3 className="text-xl font-bold text-slate-800">
                    {waStatus === 'connected' ?'WhatsApp Ativo' : 'Aguardando Conexão'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    {waStatus === 'connected' 
                      ?'Seu WhatsApp está conectado e pronto para enviar/receber mensagens diretamente pelo CRM.'
                      : 'Você pode escanear o QR Code acima ou usar o método de código de pareamento por número de telefone.'}
                  </p>
                  {waStatus !== 'connected' && (
                    <button 
                      onClick={handleRestartWA}
                      className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all w-fit"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Forçar Reinício da Conexão
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-900 leading-relaxed">
                  <p className="font-bold mb-1">Atenção (Modo Teste):</p>
                  <p>Este modo utiliza uma conexão direta via QR Code. Não é necessário configurar Webhooks da Meta neste modo.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Departments Section */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" /> Departamentos
                </h2>
                <div className="space-y-4">
                  {departments.map(dept => (
                    <div key={dept.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      {editingDept === dept.id ?(
                        <div className="flex items-center gap-2 flex-1 mr-4">
                          <input 
                            className="flex-1 text-sm p-1.5 border rounded" 
                            value={editDeptName}
                            onChange={e => setEditDeptName(e.target.value)}
                          />
                          <button onClick={handleUpdateDept} className="text-green-600"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setEditingDept(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <h3 className="font-bold text-sm">{dept.name}</h3>
                            <p className="text-[10px] text-slate-400">
                              {users.filter(u => u.departmentId === dept.id).length} Colaboradores
                            </p>
                          </div>
                          <button 
                            onClick={() => {
                              setEditingDept(dept.id);
                              setEditDeptName(dept.name);
                            }}
                            className="text-xs font-bold text-indigo-600 hover:underline"
                          >
                            Editar
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Users/Roles Section */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" /> Colaboradores e Papéis
                </h2>
                <div className="space-y-4">
                  {users.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                          {user.name.charAt(0)}
                        </div>
                        {editingUser === user.id ?(
                          <div className="flex flex-col gap-2 flex-1 mr-4">
                            <p className="text-sm font-bold">{user.name}</p>
                            <div className="flex gap-2">
                              <select 
                                className="text-[10px] p-1 border rounded"
                                value={editUserData.role}
                                onChange={e => setEditUserData({...editUserData, role: e.target.value as UserRole})}
                              >
                                <option value="Super Admin">Super Admin</option>
                                <option value="Admin">Admin</option>
                                <option value="Colaborador">Colaborador</option>
                              </select>
                              <select 
                                className="text-[10px] p-1 border rounded"
                                value={editUserData.departmentId}
                                onChange={e => setEditUserData({...editUserData, departmentId: e.target.value})}
                              >
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                              <button onClick={handleUpdateUser} className="text-green-600"><Save className="w-4 h-4" /></button>
                              <button onClick={() => setEditingUser(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h3 className="font-bold text-sm">{user.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                {user.role}
                              </span>
                              {user.departmentId && (
                                <span className="text-[10px] text-slate-400">
                                  em {departments.find(d => d.id === user.departmentId)?.name}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {editingUser !== user.id && (
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => {
                              setEditingUser(user.id);
                              setEditUserData({
                                role: user.role,
                                departmentId: user.departmentId
                              });
                            }}
                            className="text-xs font-bold text-indigo-600 hover:underline"
                          >
                            Configurar
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-600" /> Registros de Atividade
              </h2>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {activityLogs.length > 0 ?activityLogs.map(log => (
                  <div key={log.id} className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">
                          {getActivityLabel(log.action)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {log.actor_name || 'Sistema'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {log.details?.customerName || log.details?.fileName || log.details?.assignedToName || log.entity_type || 'Atividade registrada'}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {log.created_at ?format(new Date(log.created_at), 'dd/MM HH:mm') : ''}
                    </span>
                  </div>
                )) : (
                  <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                    <p className="text-sm text-slate-400">Nenhum registro encontrado. Rode o SQL de logs no Supabase para ativar esta área.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {activeTab === 'dashboard' && (
        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-8">Visão Geral</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Atendimentos</p>
                <h3 className="text-3xl font-bold">{tickets.length}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Em Produção</p>
                <h3 className="text-3xl font-bold text-orange-500">
                  {tickets.filter(t => t.status === 'Produção').length}
                </h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Finalizados</p>
                <h3 className="text-3xl font-bold text-green-500">
                  {tickets.filter(t => t.status === 'Finalizado').length}
                </h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Novos Clientes</p>
                <h3 className="text-3xl font-bold text-indigo-600">{customers.length}</h3>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold mb-6">Demanda por Departamento</h2>
              <div className="space-y-6">
                {departments.map(dept => {
                  const count = tickets.filter(t => t.departmentId === dept.id).length;
                  const percentage = tickets.length > 0 ?(count / tickets.length) * 100 : 0;
                  return (
                    <div key={dept.id}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold">{dept.name}</span>
                        <span className="text-xs text-slate-400">{count} projetos</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      )}
      <AnimatePresence>
        {pendingTransfer && (() => {
          const transferTicket = tickets.find(t => t.id === pendingTransfer.ticketId);
          const transferCustomer = transferTicket ?customers.find(c => c.id === transferTicket.customerId) : null;
          const transferDepartment = departments.find(d => d.id === pendingTransfer.departmentId);

          return (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-sm px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-100 overflow-hidden"
              >
                <div className="p-6 bg-gradient-to-br from-emerald-50 to-white border-b border-emerald-100">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                    <ArrowRightCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">
                    Confirma o envio de {transferCustomer?.name || 'cliente'} ao departamento {transferDepartment?.name || 'selecionado'}?
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    O cliente volta sem colaborador atribuido, para que o Gestor do novo departamento escolha o proximo responsavel. Voce continua acompanhando a conversa e pode usar o chat interno.
                  </p>
                </div>
                <div className="p-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingTransfer(null)}
                    disabled={transferSubmitting}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmDepartmentTransfer}
                    disabled={transferSubmitting}
                    className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {transferSubmitting ?'Enviando...' : 'Confirmar envio'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {transferSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 text-white px-5 py-4 shadow-2xl shadow-emerald-900/20"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-bold">{transferSuccessMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}





