// bot.js

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        logger: logger,
        auth: state,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("סרוק את קוד ה-QR הבא כדי להתחבר לוואטסאפ:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`החיבור נסגר, סיבה: ${statusCode}. מתחבר מחדש: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            }

        } else if (connection === 'open') {
            console.log('החיבור לוואטסאפ הצליח!');
            console.log('KingOBot מוכן לפעולה!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    listenToMessages(sock);
}

async function listenToMessages(sock) {
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.type !== 'notify') return;

        const msg = m.messages[0];
        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');
        const originalMessageText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
        const messageText = originalMessageText.toLowerCase();

        if (messageText === '!פינג') {
            await sock.sendMessage(remoteJid, { text: 'פונג! 🏓' }, { quoted: msg });
        }

        if (messageText === '!עזרה') {
            try {
                // ========================================================
                // <<< גרסת ה"מודעה" עם externalAdReply >>>
                // ========================================================
                const groupLink = 'https://chat.whatsapp.com/EjhNtVsPWOo4pSdFKDrgZV';
                const imageUrl = 'https://mitmachim.top/assets/uploads/files/1751171967758-image-2.png'; // התמונה החדשה שלך

                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data, 'binary');

                const helpMessageWithAdReply = {
                    text: `👑 *תפריט העזרה של KingOBot* 👑

הבוט הזה מאפשר תיוג המוני בקבוצות וואטסאפ בקלות ובמהירות.

*רשימת הפקודות:*
- *!פינג*
- *!עזרה*
- *!תייג את כולם*
- *!תייג [הטקסט שלך]*

*👈 לחץ כאן להצטרפות לקבוצת התמיכה*`,
                    
                    contextInfo: {
                        externalAdReply: {
                            title: 'KingOBot - הקבוצה הרשמית',
                            body: 'הצטרף עכשיו!',
                            renderLargerThumbnail: true,
                            showAdAttribution: true,
                            thumbnail: imageBuffer, // התמונה החתוכה
                            mediaType: 1,
                            sourceUrl: groupLink // הקישור שאליו הכל מוביל
                        }
                    }
                };

                await sock.sendMessage(remoteJid, helpMessageWithAdReply);

            } catch (error) {
                console.error("שגיאה ביצירת הודעת העזרה:", error);
                await sock.sendMessage(remoteJid, { text: "אופס, קרתה שגיאה. נסה שוב מאוחר יותר." });
            }
            return;
        }

        if (messageText === '!תייג את כולם') {
            if (!isGroup) {
                return sock.sendMessage(remoteJid, { text: 'פקודה זו זמינה בקבוצות בלבד.' }, { quoted: msg });
            }
            const groupMetadata = await sock.groupMetadata(remoteJid);
            const participants = groupMetadata.participants;
            let text = '```\n';
            let mentions = [];
            for (const participant of participants) {
                const userJid = participant.id;
                const userNumber = userJid.split('@')[0];
                text += `@${userNumber}\n`;
                mentions.push(userJid);
            }
            text += '```\nנשלח באמצעות KingOBot';
            await sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
        } 
        
        else if (messageText.startsWith('!תייג ')) {
            if (!isGroup) {
                return sock.sendMessage(remoteJid, { text: 'פקודה זו זמינה בקבוצות בלבד.' }, { quoted: msg });
            }
            const customText = originalMessageText.substring('!תייג '.length);
            const groupMetadata = await sock.groupMetadata(remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);
            await sock.sendMessage(remoteJid, { text: customText, mentions: participants }, { quoted: msg });
        }
    });
}

connectToWhatsApp();