import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import QRCode from 'qrcode';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception thrown:', err);
  // Keep process alive in production to avoid restart loops/502.
});

// Ensure media directory exists
const mediaDir = path.join(process.cwd(), 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, mediaDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase environment variables are missing!');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// Helper to log Supabase errors clearly
const logSupabaseError = (context: string, error: any) => {
  console.error(`[SUPABASE-ERROR] ${context}:`, JSON.stringify(error, null, 2));
};

async function uploadToSupabase(buffer: Buffer, fileName: string, mimeType: string) {
  const bucketName = 'chat-media';
  
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: true
    });

  if (error) {
    // If bucket doesn't exist, this might be the reason. 
    // We can't create buckets with anon key usually, but we log it.
    console.error(`[SUPABASE-STORAGE-ERROR] Failed to upload ${fileName}. Ensure bucket "${bucketName}" exists and is public.`, error);
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return {
    bucket: bucketName,
    path: fileName,
    publicUrl
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const APP_URL = process.env.APP_URL;
  const AUTO_START_WHATSAPP = process.env.AUTO_START_WHATSAPP
    ? process.env.AUTO_START_WHATSAPP !== 'false'
    : true;

  app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
    next();
  });

  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/ready', (_req, res) => {
    res.status(200).json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      whatsappAutoStart: AUTO_START_WHATSAPP
    });
  });

  const getPublicBaseUrl = (req?: express.Request) => {
    if (APP_URL) return APP_URL.replace(/\/$/, '');
    if (req) {
      const protocol = req.headers['x-forwarded-proto']?.toString() || req.protocol || 'http';
      const host = req.headers.host;
      if (host) return `${protocol}://${host}`;
    }
    return `http://localhost:${PORT}`;
  };

  // WhatsApp Connection Logic (Baileys)
  let sock: any = null;
  let qrCodeData: string | null = null;
  let pairingCode: string | null = null;
  let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  let connectionTimeout: NodeJS.Timeout | null = null;

  const logger = pino({ level: 'info' });

  let reconnectionAttempts = 0;
  let isConnecting = false;
  const MAX_RECONNECT_ATTEMPTS = 15; // Further increased for stability

  const normalizeWhatsAppPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  };

  const ensureWhatsAppStarted = () => {
    if (!AUTO_START_WHATSAPP) return;
    if (connectionStatus === 'connected' || isConnecting || sock) return;
    console.log('[WA] Auto-starting WhatsApp connection from status check...');
    connectToWhatsApp().catch(error => console.error('[WA] Auto-start failed:', error));
  };

  async function connectToWhatsApp() {
    if (isConnecting) {
      console.log('[WA] Already attempting to connect, skipping redundant call.');
      return;
    }
    isConnecting = true;

    console.log(`[WA] Attempting to connect... (Attempt ${reconnectionAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
    // Prevent multiple concurrent connection attempts
    if (sock) {
      console.log('[WA] Cleaning up existing socket resources...');
      try {
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('creds.update');
        sock.ev.removeAllListeners('messages.upsert');
        // socket.end() is the correct method for Baileys
        sock.end(undefined);
      } catch (e) {
        console.log('[WA] Note: Error during socket cleanup (usually fine):', e);
      }
      sock = null;
    }

    // Clear any existing timeout
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    // Set a watchdog: if we don't connect or get a QR within 120s, restart
    connectionTimeout = setTimeout(() => {
      if (connectionStatus !== 'connected' && !qrCodeData) {
        console.log('[WA] Connection watchdog triggered: stuck without connection or QR for 120s. Force restarting...');
        reconnectionAttempts = 0; 
        isConnecting = false; // Reset to allow the manual/watchdog restart
        connectToWhatsApp();
      }
    }, 120000);

    try {
      const {
        default: makeWASocket,
        DisconnectReason,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore,
        downloadMediaMessage
      } = await import('@whiskeysockets/baileys');

      // Use a more robust path for auth info
      const authPath = path.join(process.cwd(), 'auth_info_baileys');
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

      // Reset connecting flag before socket creation as initialization phase is done
      isConnecting = false;

      sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        syncFullHistory: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          qrCodeData = await QRCode.toDataURL(qr);
          connectionStatus = 'connecting';
          if (connectionTimeout) clearTimeout(connectionTimeout);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMsg = lastDisconnect?.error?.message || lastDisconnect?.error?.toString() || '';
          
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isTimedOut = statusCode === 408 || errorMsg.includes('QR refs attempts ended');
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || errorMsg.includes('restart required');
          const isStreamError = statusCode === 515 || errorMsg.includes('Stream Errored');
          const isConnectionTerminated = statusCode === 428 || errorMsg.includes('Connection Terminated');
          const isBadRequest = errorMsg.includes('bad-request') || statusCode === 400;
          
          console.log(`[WA] Connection closed. Reason: ${lastDisconnect?.error}, StatusCode: ${statusCode}, Msg: ${errorMsg}`);
          connectionStatus = 'disconnected';
          qrCodeData = null;
          pairingCode = null;

          if (isLoggedOut || isBadRequest) {
            console.log(`[WA] ${isLoggedOut ? 'Logged out' : 'Bad Request'}. Clearing session...`);
            const authPath = path.join(process.cwd(), 'auth_info_baileys');
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true, force: true });
            }
            reconnectionAttempts = 0;
            if (isBadRequest) setTimeout(connectToWhatsApp, 5000);
          } else if (isTimedOut || isConnectionTerminated) {
            // For QR timeouts, we reset attempts to let the user try again
            if (isTimedOut) {
              console.log('[WA] QR Timeout or attempts ended. Resetting attempts.');
              reconnectionAttempts = 0; 
            } else {
              reconnectionAttempts++;
            }

            console.log(`[WA] Timeout/Terminated. Reconnection: (${reconnectionAttempts}/${MAX_RECONNECT_ATTEMPTS}). Status: ${statusCode}`);
            
            if (reconnectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
              console.log('[WA] Max reconnect attempts reached. Stopping.');
              return;
            }

            // If QR attempts ended, we MUST clear session to get a new start
            const isQREnded = errorMsg.includes('QR refs attempts ended') || statusCode === 408;
            const forceClear = isQREnded || reconnectionAttempts > 3;
            
            if (forceClear) {
              const authPath = path.join(process.cwd(), 'auth_info_baileys');
              console.log(`[WA] Force clearing session at ${authPath} due to: ${isQREnded ? 'QR Timeout' : 'Persistent Error'}`);
              try {
                if (fs.existsSync(authPath)) {
                  fs.rmSync(authPath, { recursive: true, force: true });
                  console.log('[WA] Session folder deleted successfully.');
                }
              } catch (fsErr) {
                console.error('[WA] Error deleting session folder:', fsErr);
              }
            }
            
            // On QR timeout, wait a bit longer to ensure socket fully dies
            const delay = isQREnded ? 10000 : 5000;
            console.log(`[WA] Scheduling reconnection in ${delay}ms...`);
            setTimeout(connectToWhatsApp, delay);
          } else if (isRestartRequired || isStreamError) {
            console.log(`[WA] Restart required or Stream Error (${statusCode}). Reconnecting...`);
            setTimeout(connectToWhatsApp, 3000);
          } else {
            // Standard reconnection for other errors
            console.log(`[WA] Connection closed due to other error (${statusCode}). Reconnecting...`);
            setTimeout(connectToWhatsApp, 3000);
          }
        } else if (connection === 'open') {
          console.log('[WA] Connection opened successfully');
          connectionStatus = 'connected';
          qrCodeData = null;
          pairingCode = null;
          reconnectionAttempts = 0;
          if (connectionTimeout) clearTimeout(connectionTimeout);
        }
      });

    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;
      const messages = m.messages || [];
      for (const msg of messages) {
        try {
          if (!msg.message || msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net')) continue;

          const phone = remoteJid.split('@')[0].replace(/\D/g, '');
          console.log(`[WA-IN] Processing message from ${phone}:`, JSON.stringify(msg.message).substring(0, 100));
          
          // Better message text extraction
          let text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.buttonsResponseMessage?.selectedButtonId || 
                     msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                     "";

          // Detect Audio/Media
          let mediaUrl = "";
          let actualMessage = msg.message;
          
          // Handle wrappers
          if (actualMessage.viewOnceMessageV2?.message) {
            actualMessage = actualMessage.viewOnceMessageV2.message;
          } else if (actualMessage.viewOnceMessage?.message) {
            actualMessage = actualMessage.viewOnceMessage.message;
          } else if (actualMessage.ephemeralMessage?.message) {
            actualMessage = actualMessage.ephemeralMessage.message;
          }

          // Update text if it's still empty and we have a wrapped message
          if (!text) {
            text = actualMessage.conversation || 
                   actualMessage.extendedTextMessage?.text || 
                   "";
          }

          const mType = actualMessage.audioMessage ? 'audio' :
                        actualMessage.imageMessage ? 'image' :
                        actualMessage.videoMessage ? 'video' :
                        actualMessage.documentMessage ? 'document' : null;
          let mediaStoragePath = '';
          let mediaFileName = '';
          let mediaMimeType = '';
          let mediaSize = 0;

          if (mType) {
            console.log(`[WA-IN] Downloading ${mType} from ${phone}...`);
            try {
              const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { 
                  logger: logger,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              
              const extension = mType === 'audio' ? 'mp3' : 
                               mType === 'image' ? 'jpg' : 
                               mType === 'video' ? 'mp4' : 
                               (actualMessage.documentMessage?.fileName?.split('.').pop() || 'bin');
              
              const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
              const mimeType = actualMessage.documentMessage?.mimetype ||
                               (mType === 'audio' ? 'audio/mpeg' : 
                               mType === 'image' ? 'image/jpeg' : 
                               mType === 'video' ? 'video/mp4' : 'application/octet-stream');
              mediaFileName = fileName;
              mediaMimeType = mimeType;
              mediaSize = (buffer as Buffer).length;
              mediaStoragePath = `whatsapp/${phone}/${fileName}`;

              console.log(`[WA-IN] Uploading ${mType} to Supabase Storage...`);
              try {
                const uploadResult = await uploadToSupabase(buffer as Buffer, mediaStoragePath, mimeType);
                mediaUrl = uploadResult.publicUrl;
                console.log(`[WA-IN] Media uploaded successfully: ${mediaUrl}`);
              } catch (uploadError) {
                console.error(`[WA-IN-ERROR] Supabase upload failed, falling back to local:`, uploadError);
                const filePath = path.join(mediaDir, fileName);
                fs.writeFileSync(filePath, buffer as Buffer);
                mediaUrl = `/media/${fileName}`;
              }
              
              if (mType === 'audio') text = `[AUDIO]${mediaUrl}`;
              else if (mType === 'image') text = `[IMAGE]${mediaUrl}`;
              else if (mType === 'video') text = `[VIDEO]${mediaUrl}`;
              else text = `[FILE]${mediaUrl}`;
            } catch (downloadError) {
              console.error(`[WA-IN-ERROR] Failed to download ${mType}:`, downloadError);
              text = `âš ï¸ [ERRO AO BAIXAR ${mType.toUpperCase()}]`;
            }
          } else if (msg.message.stickerMessage) {
            text = "ðŸŽ¨ [Sticker]";
          }

          if (!text) {
            console.log('[WA-IN] Empty message received, skipping.');
            continue;
          }

          console.log(`[WA-IN] Processing message from ${phone}: ${text}`);

          // 1. Find or create customer
          let { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();

          if (customerError) logSupabaseError('Finding customer', customerError);

          if (!customer) {
            console.log(`[WA-IN] Creating new customer for ${phone}`);
            const { data: newCustomer, error: createCustomerError } = await supabase
              .from('customers')
              .insert({ name: `Cliente ${phone}`, phone: phone })
              .select()
              .maybeSingle();
            
            if (createCustomerError) throw createCustomerError;
            customer = newCustomer;
          }

          if (!customer) throw new Error('Failed to retrieve or create customer');

          // 2. Find open ticket for this customer
          let { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('id, department_id')
            .eq('customer_id', customer.id)
            .neq('status', 'Finalizado')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ticketError) logSupabaseError('Finding ticket', ticketError);

          if (!ticket) {
            console.log(`[WA-IN] Creating new ticket for customer ${customer.id}`);
            const { data: depts } = await supabase.from('departments').select('id').order('sequence', { ascending: true }).limit(1);
            const deptId = depts?.[0]?.id;

            if (!deptId) {
              console.error('No departments found to assign new ticket.');
              continue;
            }

            const { data: newTicket, error: createTicketError } = await supabase
              .from('tickets')
              .insert({
                customer_id: customer.id,
                title: text.substring(0, 50),
                status: 'Novo',
                department_id: deptId,
                last_message: text
              })
              .select()
              .maybeSingle();
            
            if (createTicketError) throw createTicketError;
            ticket = newTicket;
          }

          if (!ticket) throw new Error('Failed to retrieve or create ticket');

          // 3. Insert message
          console.log(`[WA-IN] Inserting message for ticket ${ticket.id}`);
          let { data: insertedMessage, error: msgError } = await supabase
            .from('messages')
            .insert({
              ticket_id: ticket.id,
              text: text,
              sender: 'customer',
              message_type: mType || 'text',
              media_url: mediaUrl || null,
              media_mime_type: mediaMimeType || null,
              media_file_name: actualMessage.documentMessage?.fileName || mediaFileName || null,
              media_size: mediaSize || null
            })
            .select('id')
            .maybeSingle();

          if (msgError) {
            const fallback = await supabase
              .from('messages')
              .insert({
                ticket_id: ticket.id,
                text: text,
                sender: 'customer'
              })
              .select('id')
              .maybeSingle();

            if (fallback.error) throw fallback.error;
            insertedMessage = fallback.data;
          }

          if (insertedMessage?.id && mediaUrl) {
            const { error: attachmentError } = await supabase
                .from('message_attachments')
                .insert({
                  message_id: insertedMessage.id,
                  ticket_id: ticket.id,
                  customer_id: customer.id,
                  bucket: 'chat-media',
                  storage_path: mediaStoragePath || mediaFileName,
                  public_url: mediaUrl,
                  file_name: mediaFileName,
                  original_name: actualMessage.documentMessage?.fileName || mediaFileName,
                  mime_type: mediaMimeType,
                  file_size: mediaSize,
                  attachment_type: mType === 'document' ? 'document' : mType
                });
            if (attachmentError) logSupabaseError('Saving message attachment metadata', attachmentError);
          }

          // 4. Update ticket last message
          await supabase
            .from('tickets')
            .update({ last_message: text, updated_at: new Date().toISOString() })
            .eq('id', ticket.id);

          console.log(`[WA-IN] Successfully processed message from ${phone}`);
        } catch (error) {
          console.error('[WA-IN-ERROR] Error processing message:', error);
        }
      }
    });
  } catch (err) {
    console.error('[WA] Error in connectToWhatsApp:', err);
    isConnecting = false;
    setTimeout(connectToWhatsApp, 10000);
  }
}

  // Start WhatsApp connection (non-blocking, resilient)
  if (AUTO_START_WHATSAPP) {
    try {
      connectToWhatsApp();
    } catch (err) {
      console.error('[WA] Failed to start WhatsApp bootstrap:', err);
    }
  } else {
    console.log('[WA] Auto-start disabled via AUTO_START_WHATSAPP=false');
  }

  // Test Supabase Connection
  (async () => {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('departments').select('count', { count: 'exact', head: true });
    if (error) {
      logSupabaseError('Supabase connection test failed', error);
      console.error('Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    } else {
      console.log('Supabase connection successful! Found departments table.');
    }

    // Test Storage Connection
    try {
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      if (storageError) {
        console.error('[SUPABASE-STORAGE] Could not list buckets (check permissions):', storageError);
      } else {
        const hasBucket = buckets.some(b => b.name === 'chat-media');
        if (hasBucket) {
          console.log('[SUPABASE-STORAGE] Bucket "chat-media" found and ready!');
        } else {
          console.warn('[SUPABASE-STORAGE] Bucket "chat-media" NOT found. Please create it in Supabase dashboard.');
        }
      }
    } catch (e) {
      console.error('[SUPABASE-STORAGE] Error testing storage:', e);
    }
  })();

  // API Routes
  app.use('/media', express.static(mediaDir));

  // File Upload Endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    try {
      const buffer = fs.readFileSync(req.file.path);
      const fileName = req.file.filename;
      const mimeType = req.file.mimetype;
      
      console.log(`[UPLOAD] Uploading ${fileName} to Supabase Storage...`);
      const originalName = req.file.originalname;
      const safeOriginalName = originalName.replace(/[^\w.\-]+/g, '_');
      const storagePath = `uploads/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeOriginalName}`;
      const uploadResult = await uploadToSupabase(buffer, storagePath, mimeType);
      
      // Clean up local file
      fs.unlinkSync(req.file.path);
      
      res.json({
        success: true,
        url: uploadResult.publicUrl,
        bucket: uploadResult.bucket,
        path: uploadResult.path,
        originalName,
        fileName: path.basename(uploadResult.path),
        mimeType,
        size: req.file.size,
        storageProvider: 'supabase'
      });
    } catch (error) {
      console.error('[UPLOAD-ERROR] Failed to upload to Supabase:', error);
      // Fallback to local URL if Supabase fails
      const fileUrl = `/media/${req.file.filename}`;
      res.json({
        success: true,
        url: fileUrl,
        bucket: 'local-media',
        path: req.file.filename,
        originalName: req.file.originalname,
        fileName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageProvider: 'local'
      });
    }
  });
  
  // Get WhatsApp QR Code and Status
  app.get("/api/whatsapp/status", (req, res) => {
    ensureWhatsAppStarted();
    res.json({ 
      status: connectionStatus, 
      qr: qrCodeData,
      pairingCode: pairingCode,
      reconnectionAttempts: reconnectionAttempts,
      maxReached: reconnectionAttempts >= MAX_RECONNECT_ATTEMPTS
    });
  });

  // Request Pairing Code
  app.post("/api/whatsapp/pair", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    
    reconnectionAttempts = 0;
    try {
      if (!sock) {
        await connectToWhatsApp();
      }
      
      // Wait a bit for sock to be ready
      let attempts = 0;
      while (!sock && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      if (!sock) throw new Error('Failed to initialize WhatsApp socket');

      const normalizedPhone = normalizeWhatsAppPhone(phone);
      console.log(`[WA] Requesting pairing code for ${normalizedPhone}`);
      const code = await sock.requestPairingCode(normalizedPhone);
      pairingCode = code;
      res.json({ success: true, code });
    } catch (error) {
      console.error('[WA] Error requesting pairing code:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Restart WhatsApp Connection
  app.post("/api/whatsapp/restart", async (req, res) => {
    console.log('[WA] Manual restart requested');
    reconnectionAttempts = 0;
    try {
      if (sock) {
        try {
          await sock.logout(); // This will trigger the 'close' event
        } catch (e) {
          console.log('[WA] Logout error (likely already disconnected):', e);
          // If logout fails, we manually clear and restart
          if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
          }
          connectToWhatsApp();
        }
      } else {
        // If no socket, just clear and start
        if (fs.existsSync('auth_info_baileys')) {
          fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        }
        connectToWhatsApp();
      }
      res.json({ success: true, message: 'Reiniciando conexão...' });
    } catch (error) {
      console.error('Error restarting WA:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // WhatsApp Integration Endpoint (Simulated/Real)
  app.post("/api/whatsapp/send", async (req, res) => {
    const { to, message } = req.body;
    
    if (connectionStatus === 'connected' && sock) {
      try {
        const jid = normalizeWhatsAppPhone(to) + '@s.whatsapp.net';
        
        // Handle Media Messages
        if (message.startsWith('[IMAGE]') || message.startsWith('ðŸ“· [IMAGE]')) {
          const url = message.replace('[IMAGE]', '').replace('ðŸ“· [IMAGE]', '');
          // If it's a local path /media/..., we need to read it from disk
          if (url.startsWith('/media/')) {
            const fileName = url.replace('/media/', '');
            const filePath = path.join(mediaDir, fileName);
            if (fs.existsSync(filePath)) {
              await sock.sendMessage(jid, { image: fs.readFileSync(filePath) });
              return res.json({ success: true, status: 'sent' });
            }
          }
          // Fallback to text if file not found or external URL (Baileys can handle URLs too sometimes)
          const finalUrl = (url.startsWith('http') || url.startsWith('blob:')) ? url : `${getPublicBaseUrl(req)}${url}`;
          if (finalUrl.startsWith('blob:')) {
            console.error('[WA] Cannot send blob URL to WhatsApp. Client must upload file first.');
            return res.status(400).json({ success: false, error: 'Cannot send blob URL' });
          }
          await sock.sendMessage(jid, { image: { url: finalUrl } });
        } else if (message.startsWith('[AUDIO]') || message.startsWith('ðŸŽ¤ [AUDIO]')) {
          const url = message.replace('[AUDIO]', '').replace('ðŸŽ¤ [AUDIO]', '');
          if (url.startsWith('/media/')) {
            const fileName = url.replace('/media/', '');
            const filePath = path.join(mediaDir, fileName);
            if (fs.existsSync(filePath)) {
              await sock.sendMessage(jid, { audio: fs.readFileSync(filePath), mimetype: 'audio/mp4', ptt: true });
              return res.json({ success: true, status: 'sent' });
            }
          }
          const finalUrl = (url.startsWith('http') || url.startsWith('blob:')) ? url : `${getPublicBaseUrl(req)}${url}`;
          if (finalUrl.startsWith('blob:')) {
            console.error('[WA] Cannot send blob URL to WhatsApp. Client must upload file first.');
            return res.status(400).json({ success: false, error: 'Cannot send blob URL' });
          }
          await sock.sendMessage(jid, { audio: { url: finalUrl }, mimetype: 'audio/mp4', ptt: true });
        } else if (message.startsWith('[VIDEO]') || message.startsWith('ðŸŽ¥ [VIDEO]')) {
          const url = message.replace('[VIDEO]', '').replace('ðŸŽ¥ [VIDEO]', '');
          const finalUrl = (url.startsWith('http') || url.startsWith('blob:')) ? url : `${getPublicBaseUrl(req)}${url}`;
          if (finalUrl.startsWith('blob:')) {
            console.error('[WA] Cannot send blob URL to WhatsApp. Client must upload file first.');
            return res.status(400).json({ success: false, error: 'Cannot send blob URL' });
          }
          await sock.sendMessage(jid, { video: { url: finalUrl } });
        } else if (message.startsWith('[FILE]') || message.startsWith('ðŸ“„ [FILE]')) {
          const url = message.replace('[FILE]', '').replace('ðŸ“„ [FILE]', '');
          const finalUrl = (url.startsWith('http') || url.startsWith('blob:')) ? url : `${getPublicBaseUrl(req)}${url}`;
          if (finalUrl.startsWith('blob:')) {
            console.error('[WA] Cannot send blob URL to WhatsApp. Client must upload file first.');
            return res.status(400).json({ success: false, error: 'Cannot send blob URL' });
          }
          await sock.sendMessage(jid, { document: { url: finalUrl }, fileName: 'arquivo' });
        } else {
          // Regular Text
          await sock.sendMessage(jid, { text: message });
        }
        
        return res.json({ success: true, status: 'sent' });
      } catch (error) {
        console.error('Error sending message via Baileys:', error);
        return res.status(500).json({ success: false, error: 'Failed to send message' });
      }
    }

    const apiKey = process.env.WHATSAPP_API_KEY;
    if (!apiKey) {
      console.log(`[SIMULATION] Sending WhatsApp to ${to}: ${message}`);
      return res.json({ success: true, status: 'simulated' });
    }

    res.json({ success: true, status: 'sent' });
  });

  // WhatsApp Webhook (Meta Business API - Kept for compatibility)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === "MY_VERIFY_TOKEN") {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  });

  app.post("/api/whatsapp/webhook", (req, res) => {
    const body = req.body;
    if (body.object) {
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  });

  // Email Invitation Endpoint
  app.post("/api/invite", async (req, res) => {
    const { email, department, role } = req.body;
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      console.log(`[SIMULATION] Sending Invitation Email to ${email} for ${department} as ${role}`);
      return res.json({ success: true, status: 'simulated' });
    }

    res.json({ success: true, status: 'sent' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
    if (hasDist) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('[SERVER] dist/index.html not found. Run "npm run build" before start.');
      app.get('/', (_req, res) => {
        res.status(200).send('Server is running, but frontend is not built yet.');
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Started successfully on port ${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SERVER] Supabase URL: ${supabaseUrl}`);
    console.log(`[SERVER] WhatsApp auto-start: ${AUTO_START_WHATSAPP ? 'enabled' : 'disabled'}`);
  });
}

startServer();

