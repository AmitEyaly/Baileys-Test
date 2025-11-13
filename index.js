
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    isJidBroadcast
} from '@whiskeysockets/baileys';

// Other imports
import { Boom } from '@hapi/boom'; // For error handling
import P from 'pino'; // For logging
import QRCode from 'qrcode'; // For generating QR codes

// Reconnection attempt counter
let reconnectAttempts = 0;
const MAX_ATTEMPTS = 5;

// --- 1. Function to create and manage the WhatsApp connection ---
async function connectToWhatsApp() {

    // Load/Save authentication credentials from a file
    // 'auth_info_baileys' is the folder where session data will be stored
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const version = [2, 3000, 1027934701]; // Specify WhatsApp Web version

    // Create a new WhatsApp socket connection
    const sock = makeWASocket({
        logger: P({ level: 'silent' }), // Suppress Baileys internal logs for cleaner output
        version: version, // Set WhatsApp Web version
        markOnlineOnConnect: false, // Don't mark as online on connect
        auth: state, // Pass the loaded authentication state
        browser: ['MyBot', 'Chrome', '1.0'], // Custom browser info
    });

    // --- 2. Event Handlers for Connection Updates ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('Update event:', update);
        // --- 2.1. DISCONNECTION LOGIC ---
        if (connection === 'close') {
        const shouldReconnect =  (lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : undefined) !== DisconnectReason.loggedOut;

            if (shouldReconnect && reconnectAttempts < MAX_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting reconnection ${reconnectAttempts}/${MAX_ATTEMPTS} in 5 seconds...`);

                setTimeout(async() => {
                   await connectToWhatsApp();
                }, 5000);

            } else if (reconnectAttempts >= MAX_ATTEMPTS) {
                console.log(`Failed to reconnect after ${MAX_ATTEMPTS} attempts. Exiting.`);
                // Reset counter and exit process if max attempts reached
                reconnectAttempts = 0;
                process.exit(1);
            } else {
                // This is the DisconnectReason.loggedOut case
                reconnectAttempts = 0; // Reset counter for new session
                console.log('Logged out. Please rescan QR.');
            }
        }
        // --- 2.2. CONNECTION OPEN LOGIC ---
        else if (connection === 'open') {
            reconnectAttempts = 0; // Reset counter on successful connection
            console.log('Opened connection to WhatsApp! 🎉');
        }

        // --- 2.3. QR CODE LOGIC ---
        if (qr) {
            console.log('QR code received. Please scan to connect.');
            try {
                // Ensure you have 'npm install qrcode' and 'import QRCode from "qrcode"'
                const qrCodeTerminal = await QRCode.toString(qr, { type: 'terminal', small: true });
                console.log(qrCodeTerminal);
                console.log('------------------------------');
                console.log('Scan the code above with WhatsApp -> Linked Devices');
                console.log('------------------------------');
            } catch (error) {
                console.error('Failed to generate QR code in terminal:', error);
            }
        }
        else{console.log('no qr code present') }

    });

    // --- 3. Event Handler for Receiving Messages ---

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log('Received messages:', JSON.stringify(messages, null, 2));

        if (type === 'notify') {
            for (const msg of messages) {
                // Ignore messages from self or broadcast lists
                if (!msg.key.fromMe && !isJidBroadcast(msg.key.remoteJid)) {
                    const sender = msg.key.remoteJid;
                    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

                    if (messageText) {
                        console.log(`[${sender}] : ${messageText}`);

                        // Example: Reply "Hello!" to any incoming message
                        await sock.sendMessage(sender, { text: 'Hello from your Baileys bot!' });
                    }
                }
            }
        }
    });

    // --- 4. Save credentials periodically ---
    sock.ev.on('creds.update', saveCreds);

    return sock; // Return the socket object if you need it elsewhere
}

// --- 5. Start the connection ---
connectToWhatsApp().catch(err => {
    console.error('connectToWhatsApp failed:', err);
    process.exit(1);
});