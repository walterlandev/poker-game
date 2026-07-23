/* ================================================================
   ARQUIVO: backend/admin.js

   Eventos do painel de administração — listar jogadores, ver
   depósitos/saques pendentes, confirmar saque manualmente enquanto
   a API de PIX de saída do Mercado Pago não está integrada.

   SEGURANÇA: toda checagem de admin é feita aqui, no servidor, lendo
   socket.data.isAdmin (setado em server.js/autenticar direto do
   Firestore). Nunca confiar em nada que o cliente diga sobre si mesmo
   ser admin — só esconder o botão na tela não protege nada.
================================================================ */

import admin from 'firebase-admin';
import { confirmarSaque } from './wallet/wallet-manager.js';

function ehAdmin(socket) {
    return !!socket.data.isAdmin;
}

function negarAcesso(socket) {
    socket.emit('erro', { mensagem: 'Acesso restrito ao administrador.' });
}

// Converte Timestamp do Firestore (ou string ISO já existente) pra string
function serializarData(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    return null;
}

export function registrarEventosAdmin(socket, io) {

    // ----------------------------------------------------------------
    // admin:listar_usuarios
    // ----------------------------------------------------------------
    socket.on('admin:listar_usuarios', async () => {
        if (!ehAdmin(socket)) return negarAcesso(socket);

        try {
            const snap = await admin.firestore().collection('jogadores').get();
            const usuarios = snap.docs.map(d => {
                const p = d.data();
                return {
                    uid:        d.id,
                    nome:       p.nome  || '',
                    email:      p.email || '',
                    saldo:      p.saldo      || 0,
                    saldoBonus: p.saldoBonus || 0,
                    sacadoHoje: p.sacadoHoje || 0,
                    rankPontos: p.rankPontos || 0,
                    temPin:     !!p.pinHash,
                    isAdmin:    !!p.isAdmin,
                    criadoEm:   serializarData(p.criadoEm),
                };
            });
            socket.emit('admin:usuarios', { usuarios });
        } catch (e) {
            console.error('admin:listar_usuarios erro:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao listar usuários.' });
        }
    });


    // ----------------------------------------------------------------
    // admin:listar_depositos_pendentes
    // ----------------------------------------------------------------
    socket.on('admin:listar_depositos_pendentes', async () => {
        if (!ehAdmin(socket)) return negarAcesso(socket);

        try {
            const snap = await admin.firestore()
                .collection('depositos_pendentes')
                .where('status', '==', 'PENDENTE')
                .get();

            const depositos = snap.docs.map(d => {
                const dep = d.data();
                return { id: d.id, ...dep, criadoEm: serializarData(dep.criadoEm) };
            });
            socket.emit('admin:depositos_pendentes', { depositos });
        } catch (e) {
            console.error('admin:listar_depositos_pendentes erro:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao listar depósitos pendentes.' });
        }
    });


    // ----------------------------------------------------------------
    // admin:listar_saques_pendentes
    // ----------------------------------------------------------------
    socket.on('admin:listar_saques_pendentes', async () => {
        if (!ehAdmin(socket)) return negarAcesso(socket);

        try {
            const snap = await admin.firestore()
                .collection('saques_pendentes')
                .where('status', '==', 'PENDENTE')
                .get();

            const saques = snap.docs.map(d => {
                const s = d.data();
                return { id: d.id, ...s, criadoEm: serializarData(s.criadoEm) };
            });
            socket.emit('admin:saques_pendentes', { saques });
        } catch (e) {
            console.error('admin:listar_saques_pendentes erro:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao listar saques pendentes.' });
        }
    });


    // ----------------------------------------------------------------
    // admin:confirmar_saque
    // Chamado depois que o admin já mandou o PIX manualmente pelo app
    // do banco — fecha o saque no sistema (mesma função que a API real
    // do Mercado Pago vai chamar quando for integrada).
    // ----------------------------------------------------------------
    socket.on('admin:confirmar_saque', async ({ saqueId } = {}) => {
        if (!ehAdmin(socket)) return negarAcesso(socket);
        if (!saqueId) return;

        try {
            await confirmarSaque(saqueId, io);
            socket.emit('admin:saque_confirmado', { saqueId });
            console.log(`🔧 Admin ${socket.data.nome} confirmou o saque ${saqueId} manualmente.`);
        } catch (e) {
            console.error('admin:confirmar_saque erro:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao confirmar saque.' });
        }
    });
}
