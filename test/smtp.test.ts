import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { Mailer } from '../src/lib/mailer';

test('SMTP connection verification sends no message; capture never connects; From includes display name', async () => {
  const commands: string[] = [];
  let message = '';
  const server = createServer((socket) => {
    socket.write('220 localhost ESMTP\r\n');
    let data = '',
      receiving = false;
    socket.on('data', (chunk) => {
      data += chunk.toString();
      let index;
      while ((index = data.indexOf('\r\n')) >= 0) {
        const line = data.slice(0, index);
        data = data.slice(index + 2);
        if (receiving) {
          if (line === '.') {
            receiving = false;
            socket.write('250 accepted\r\n');
          } else message += line + '\n';
          continue;
        }
        commands.push(line);
        if (line.startsWith('EHLO') || line.startsWith('HELO')) socket.write('250 localhost\r\n');
        else if (line === 'DATA') {
          receiving = true;
          socket.write('354 send message\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error();
  const config = {
    host: '127.0.0.1',
    port: address.port,
    secure: false,
    user: '',
    password: '',
    from: 'sender@example.test',
    fromName: 'Stack Test',
  };
  try {
    await new Mailer(config).verify();
    assert(!commands.some((command) => command.startsWith('MAIL')));
    const before = commands.length;
    const capture = new Mailer({ ...config, transport: 'capture' });
    assert(capture.isConfigured && capture.isCapture);
    assert(
      await capture.send({
        to: 'recipient@example.test',
        subject: 'captured',
        text: 'private fixture',
      }),
    );
    assert.equal(commands.length, before);
    await new Mailer(config).send({
      to: 'recipient@example.test',
      subject: 'fixture',
      text: 'hello',
    });
    assert.match(message, /From: Stack Test <sender@example.test>/);
    assert(commands.includes('DATA'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
