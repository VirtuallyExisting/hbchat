const net = require('net');
const { Profanity } = require('@hackertron/less-strict-profanity');

const clients = [];
const bannedIPs = new Set(); // Stores real client IP addresses for banning
const profanity = new Profanity({ wholeWord: false });

// How long to wait (in ms) before we decide the client is a direct TCP client (like 3DS or Custom) 
// and not a websockify client.
const WEBSOCKIFY_TIMEOUT = 10; 

const server = net.createServer((socket) => {
    // We'll figure out the real IP later; start with the socket's connecting address.
    let clientRealIp = socket.remoteAddress; 
    let handshakeCompleted = false;
    let isWebsockify = false;
    let dataBuffer = Buffer.alloc(0);
    
    // Initial check against the connecting IP (127.0.0.1 or websockify's IP)
    if (bannedIPs.has(clientRealIp)) {
        socket.end('You are banned.\n');
        return;
    }

    console.log('Client connection established from:', clientRealIp); 
    clients.push(socket);

    // Set a short timer. If the handshake doesn't arrive before this runs out, 
    // we assume it's a raw TCP client (3DS or Custom) and skip the IP parsing.
    const handshakeTimer = setTimeout(() => {
        if (!handshakeCompleted) {
            handshakeCompleted = true; // Timer ran out, treat as raw TCP
            console.log(`Connection assumed to be raw TCP (3DS or custom client) from: ${clientRealIp}`);
            
            // Immediately process any data already received as a raw message
            dataBuffer = processChatMessages(socket, clientRealIp, dataBuffer, clients, profanity);
        }
    }, WEBSOCKIFY_TIMEOUT);


    socket.on('data', (data) => {
        // Shoving the new data onto our processing buffer
        dataBuffer = Buffer.concat([dataBuffer, data]);

        if (!handshakeCompleted) {
            const nullByteIndex1 = dataBuffer.indexOf(0);
            
            // Look for the full IP\x00PORT\x00 header
            if (nullByteIndex1 !== -1) {
                const nullByteIndex2 = dataBuffer.indexOf(0, nullByteIndex1 + 1);
                
                if (nullByteIndex2 !== -1) {
                    clearTimeout(handshakeTimer); // Found the handshake! No more waiting.
                    isWebsockify = true;
                    handshakeCompleted = true;
                    
                    // Extract the real IP address
                    const ipString = dataBuffer.subarray(0, nullByteIndex1).toString('ascii');
                    clientRealIp = ipString; 
                    
                    // Slice off the IP/Port header from the buffer
                    dataBuffer = dataBuffer.subarray(nullByteIndex2 + 1); 

                    // Real IP Ban Check: Perform the critical ban check using the extracted IP
                    if (bannedIPs.has(clientRealIp)) {
                        console.log(`Connection dropped: Real Client IP ${clientRealIp} is banned.`);
                        socket.end('You are banned.\n');
                        
                        const index = clients.indexOf(socket);
                        if (index !== -1) clients.splice(index, 1);
                        return;
                    }

                    console.log('Real Client IP identified (Websockify client):', clientRealIp);
                }
            }
        }
        
        if (handshakeCompleted) {
            // Pass necessary components for processing
            dataBuffer = processChatMessages(socket, clientRealIp, dataBuffer, clients, profanity); 
        }
    });


    socket.on('end', () => {
        clearTimeout(handshakeTimer);
        const index = clients.indexOf(socket);
        if (index !== -1) {
            clients.splice(index, 1);
        }
        console.log(`Client disconnected: ${clientRealIp}`);
    });

    socket.on('error', (err) => {
        clearTimeout(handshakeTimer);
        console.warn(`Connection error from ${clientRealIp}: ${err.message}`);
        const index = clients.indexOf(socket);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });
});

/**
 * Helper function to process messages and return the remaining buffer.
 *
 * @param {net.Socket} socket The client socket that sent the data.
 * @param {string} clientRealIp The resolved IP address of the client.
 * @param {Buffer} buffer The current data buffer for the socket.
 * @param {net.Socket[]} clients The global array of connected clients.
 * @param {Profanity} profanity The profanity filtering instance.
 * @returns {Buffer} The remaining, unprocessed portion of the buffer.
 */
function processChatMessages(socket, clientRealIp, buffer, clients, profanity) {
    if (buffer.length === 0) return Buffer.alloc(0);

    let remainingBuffer = buffer;
    if (remainingBuffer.length > 0) {
        const message = remainingBuffer.toString().trim();
        
        if (message.length > 0) {
            const censoredMsg = profanity.censor(message);
            
            // LOGGING: Keep the IP in the log
            console.log(`[${clientRealIp}] Message Processed: ${censoredMsg}`);
             
            // Broadcast the message to ALL clients (echoing to sender)
            clients.forEach((client) => {
                // Send the message content (censoredMsg), NOT including the IP
                try {
                    client.write(`${censoredMsg}\n`); 
                } catch (err) { }
            });
        }
        
        // We processed the entire remaining chunk, so we return an empty buffer.
        return Buffer.alloc(0);
    }

    // Return the (potentially empty) buffer for the next data chunk.
    return remainingBuffer;
}


server.listen(3071, '0.0.0.0', () => {
    console.log('hbchat server v0.0.1 running on port 3071.');
});
