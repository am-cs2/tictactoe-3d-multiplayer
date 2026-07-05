const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Redirige la raíz directamente al juego
app.get('/', (req, res) => {
  res.redirect('/tic_tac_toe_3d.html');
});

// Estado en memoria de las salas activas
// { "AB3F": { sockets: ["id1", "id2"] } }
const salas = {};

function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)
  let codigo;
  do {
    codigo = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (salas[codigo]); // evita colisiones
  return codigo;
}

io.on('connection', (socket) => {
  console.log('✅ Cliente conectado:', socket.id);

  socket.on('crear-sala', () => {
    const codigo = generarCodigo();
    salas[codigo] = { sockets: [socket.id] };
    socket.join(codigo);
    socket.data.sala = codigo;
    socket.data.simbolo = 0; // el creador es X
    console.log(`🆕 Sala creada: ${codigo} por ${socket.id}`);
    socket.emit('sala-creada', { codigo });
  });

  socket.on('unirse-sala', (codigo) => {
    const sala = salas[codigo];
    if (!sala) {
      socket.emit('error-sala', 'Esa sala no existe.');
      return;
    }
    if (sala.sockets.length >= 2) {
      socket.emit('error-sala', 'Esa sala ya está llena.');
      return;
    }

    sala.sockets.push(socket.id);
    socket.join(codigo);
    socket.data.sala = codigo;
    socket.data.simbolo = 1; // quien se une es O
    console.log(`🔗 ${socket.id} se unió a la sala ${codigo}`);

    // Avisa a quien se une (símbolo 1) y al creador (símbolo 0) que ya pueden jugar
    socket.emit('inicio-partida', { simbolo: 1 });
    socket.to(codigo).emit('inicio-partida', { simbolo: 0 });
  });

  socket.on('jugada', ({ codigo, x, y, z }) => {
    if (!codigo || !salas[codigo]) return;
    // Reenvía la jugada a TODOS en la sala, incluido quien la hizo,
    // para que ambos tableros apliquen los movimientos en el mismo orden.
    io.to(codigo).emit('jugada', { x, y, z });
  });

  socket.on('reiniciar', (codigo) => {
    if (!codigo || !salas[codigo]) return;
    io.to(codigo).emit('reiniciar');
  });

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
    const codigo = socket.data.sala;
    if (codigo && salas[codigo]) {
      socket.to(codigo).emit('rival-desconectado');
      salas[codigo].sockets = salas[codigo].sockets.filter(id => id !== socket.id);
      if (salas[codigo].sockets.length === 0) {
        delete salas[codigo];
        console.log(`🗑️ Sala eliminada: ${codigo}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
