const net = require('net');
const { Profanity } = require('@hackertron/less-strict-profanity');

const clients = [];
const bannedIPs = new Set(); // Stores real client IP addresses for banning
const profanity = new Profanity({ wholeWord: false });

const server = net.createServer((socket) => {
    // clientRealIp stores the IP for logging/banning; defaults to the socket's connecting address.
    let clientRealIp = socket.remoteAddress; 
    let handshakeCompleted = false;
    let dataBuffer = Buffer.alloc(0);

    // Initial check against the connecting IP (127.0.0.1 or websockify's IP)
    if (bannedIPs.has(clientRealIp)) {
        socket.end('You are banned.\n');
        return;
    }

    console.log('Client connection established from proxy:', clientRealIp); 
    clients.push(socket);

    socket.on('data', (data) => {
        dataBuffer = Buffer.concat([dataBuffer, data]);

        // Protocol Check: Websockify sends IP\x00PORT\x00 as the first data packet.
        if (!handshakeCompleted) {
            const nullByteIndex1 = dataBuffer.indexOf(0);
            
            // Requires the first null byte (after the IP) to proceed
            if (nullByteIndex1 === -1) {
                return; // Wait for more data
            }
            
            // Requires the second null byte (after the Port) to complete the handshake
            const nullByteIndex2 = dataBuffer.indexOf(0, nullByteIndex1 + 1);
            if (nullByteIndex2 === -1) {
                return; // Wait for more data
            }
            
            // Extract the real IP address
            const ipString = dataBuffer.subarray(0, nullByteIndex1).toString('ascii');
            clientRealIp = ipString; 
            handshakeCompleted = true;
            
            // Remove the IP/Port header from the buffer. The remaining data is the first chat message.
            dataBuffer = dataBuffer.subarray(nullByteIndex2 + 1); 

            // Real IP Ban Check: Perform the critical ban check using the extracted IP
            if (bannedIPs.has(clientRealIp)) {
                console.log(`Connection dropped: Real Client IP ${clientRealIp} is banned.`);
                socket.end('You are banned.\n');
                
                // Clean up the clients array
                const index = clients.indexOf(socket);
                if (index !== -1) clients.splice(index, 1);
                return;
            }

            console.log('Real Client IP identified:', clientRealIp);
        }

        // Processing of actual chat message data
        if (dataBuffer.length === 0) return; 

        // For simplicity, process the current buffer as one message
        const msg = profanity.censor(dataBuffer.toString());
        dataBuffer = Buffer.alloc(0); // Clear the buffer after processing
        
        console.log(`[${clientRealIp}] Message Received: ${msg.trim()}`); 
        
        // Broadcast the message to all other connected clients
        clients.forEach((client) => {
            if (client !== socket && !client.destroyed) { 
                try {
                    client.write(`[${clientRealIp}]: ${msg}`); 
                } catch (err) {
                    console.warn(`Write failure to a client: ${err.message}`);
                }
            }
        });
    });

    socket.on('end', () => {
        const index = clients.indexOf(socket);
        if (index !== -1) {
            clients.splice(index, 1);
        }
        console.log(`Client disconnected: ${clientRealIp}`);
    });

    socket.on('error', (err) => {
        console.warn(`Connection error from ${clientRealIp}: ${err.message}`);
        const index = clients.indexOf(socket);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });
});

server.listen(3071, '0.0.0.0', () => {
    console.log('hbchat server v0.0.1 running on port 3071.');
});
