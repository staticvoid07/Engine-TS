import net from 'net';

import World from '#/engine/World.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import TcpClientSocket from '#/server/tcp/TcpClientSocket.js';
import Environment from '#/util/Environment.js';
import OnDemand from '#/engine/OnDemand.js';

export default class TcpServer {
    tcp: net.Server;

    constructor() {
        this.tcp = net.createServer();
    }

    start() {
        this.tcp.on('connection', (s: net.Socket) => {
            s.setTimeout(30000);
            s.setNoDelay(true);

            const client = new TcpClientSocket(s, s.remoteAddress ?? 'unknown');

            s.on('data', (data: Buffer) => {
                try {
                    if (client.state === -1 || client.remaining <= 0) {
                        client.terminate();
                        return;
                    }

                    client.buffer(data);

                    if (client.state === 0) {
                        World.onClientData(client);
                    } else {
                        OnDemand.onClientData(client);
                    }
                } catch (_) {
                    client.terminate();
                }
            });

            s.on('close', () => {
                client.state = -1;

                if (client.player) {
                    client.player.addSessionLog(LoggerEventType.ENGINE, 'TCP socket closed');

                    // only detach if the player is still on THIS socket. a reconnect hands the
                    // player its new socket before the old one finishes closing (close() delays
                    // the real end by 1s), so an unconditional detach here would wipe the socket
                    // that was just handed over and leave the player clientless in the world.
                    if (client.player.client === client) {
                        client.player.client = new NullClientSocket();
                    }

                    client.player = null;
                }
            });

            s.on('error', err => {
                if (client.player) {
                    client.player.addSessionLog(LoggerEventType.ENGINE, 'TCP socket error', err.message);
                }

                s.destroy();
            });

            s.on('timeout', () => {
                if (client.player) {
                    client.player.addSessionLog(LoggerEventType.ENGINE, 'TCP socket timeout');
                }

                s.destroy();
            });
        });

        this.tcp.listen(Environment.NODE_PORT, '0.0.0.0', () => {});
    }
}
