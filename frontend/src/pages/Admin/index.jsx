/* ================================================================
   ARQUIVO: frontend/src/pages/Admin/index.jsx

   Painel de administração — só visível/funcional pra quem tem
   usuario.isAdmin === true (a proteção de verdade é no servidor,
   backend/admin.js, checando socket.data.isAdmin lido direto do
   Firestore com o Admin SDK — nada aqui depende de confiar no cliente).

   TRÊS SEÇÕES:
     → Usuários            : lista de todos os jogadores
     → Depósitos pendentes : intenções de depósito ainda não confirmadas
     → Saques pendentes    : saques aguardando o PIX de saída manual
                              (até a API do Mercado Pago ser integrada
                              de verdade — ver backend/wallet/mercadopago.js)

   PROPS:
     socket → Socket.io já autenticado
================================================================ */

import { useState, useEffect } from 'react';

function fmtBC(n) { return Number(n || 0).toLocaleString('pt-BR'); }
function fmtData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

const ABAS = [
    { id: 'usuarios',  label: 'Usuários',           icone: '👥' },
    { id: 'depositos', label: 'Depósitos pendentes', icone: '⬇️' },
    { id: 'saques',    label: 'Saques pendentes',    icone: '⬆️' },
];

export default function Admin({ socket }) {

    const [aba, setAba] = useState('usuarios');

    const [usuarios,  setUsuarios ] = useState(null);
    const [depositos, setDepositos] = useState(null);
    const [saques,    setSaques   ] = useState(null);
    const [erro,      setErro     ] = useState(null);
    const [confirmando, setConfirmando] = useState(null); // saqueId em confirmação

    // ----------------------------------------------------------------
    // Socket: escuta respostas e erros
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        const onUsuarios  = ({ usuarios })  => setUsuarios(usuarios);
        const onDepositos = ({ depositos }) => setDepositos(depositos);
        const onSaques     = ({ saques })    => setSaques(saques);
        const onSaqueConfirmado = () => {
            setConfirmando(null);
            socket.emit('admin:listar_saques_pendentes');
        };
        const onErro = ({ mensagem }) => setErro(mensagem);

        socket.on('admin:usuarios',            onUsuarios);
        socket.on('admin:depositos_pendentes', onDepositos);
        socket.on('admin:saques_pendentes',    onSaques);
        socket.on('admin:saque_confirmado',    onSaqueConfirmado);
        socket.on('erro', onErro);

        return () => {
            socket.off('admin:usuarios',            onUsuarios);
            socket.off('admin:depositos_pendentes', onDepositos);
            socket.off('admin:saques_pendentes',    onSaques);
            socket.off('admin:saque_confirmado',    onSaqueConfirmado);
            socket.off('erro', onErro);
        };
    }, [socket]);

    // Busca os dados da aba ativa ao trocar
    useEffect(() => {
        if (!socket) return;
        if (aba === 'usuarios')  socket.emit('admin:listar_usuarios');
        if (aba === 'depositos') socket.emit('admin:listar_depositos_pendentes');
        if (aba === 'saques')    socket.emit('admin:listar_saques_pendentes');
    }, [socket, aba]);

    function trocarAba(id) {
        setErro(null);
        setAba(id);
    }

    function confirmarSaque(saqueId) {
        if (!socket) return;
        setConfirmando(saqueId);
        socket.emit('admin:confirmar_saque', { saqueId });
    }

    return (
        <div style={css.container}>
            <p style={css.titulo}>🛠️ Painel de Admin</p>

            <div style={css.abas}>
                {ABAS.map(a => (
                    <button
                        key={a.id}
                        onClick={() => trocarAba(a.id)}
                        style={{
                            ...css.aba,
                            background: aba === a.id ? 'rgba(239,68,68,0.12)' : 'transparent',
                            color:      aba === a.id ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                            fontWeight: aba === a.id ? '600' : '400',
                        }}
                    >
                        {a.icone} {a.label}
                    </button>
                ))}
            </div>

            {erro && <div style={css.erro}>⚠ {erro}</div>}

            {aba === 'usuarios' && (
                <div style={css.lista}>
                    {usuarios === null ? (
                        <p style={css.vazio}>Carregando...</p>
                    ) : usuarios.length === 0 ? (
                        <p style={css.vazio}>Nenhum usuário encontrado.</p>
                    ) : usuarios.map(u => (
                        <div key={u.uid} style={css.card}>
                            <div style={css.cardTopo}>
                                <span style={css.nome}>
                                    {u.nome || '(sem nome)'} {u.isAdmin && <span style={css.badgeAdmin}>ADMIN</span>}
                                </span>
                                <span style={css.saldo}>₿C {fmtBC(u.saldo)}</span>
                            </div>
                            <p style={css.linha}>{u.email || '(sem email)'}</p>
                            <p style={css.linhaSub}>
                                Bônus: ₿C {fmtBC(u.saldoBonus)} · Sacado hoje: ₿C {fmtBC(u.sacadoHoje)} ·
                                {' '}PIN: {u.temPin ? '✓' : '✕'} · Criado: {fmtData(u.criadoEm)}
                            </p>
                            <p style={css.uid}>{u.uid}</p>
                        </div>
                    ))}
                </div>
            )}

            {aba === 'depositos' && (
                <div style={css.lista}>
                    {depositos === null ? (
                        <p style={css.vazio}>Carregando...</p>
                    ) : depositos.length === 0 ? (
                        <p style={css.vazio}>Nenhum depósito pendente.</p>
                    ) : depositos.map(d => (
                        <div key={d.id} style={css.card}>
                            <div style={css.cardTopo}>
                                <span style={css.nome}>R$ {Number(d.totalBRL || 0).toFixed(2)}</span>
                                <span style={css.saldo}>₿C {fmtBC(d.bcCreditar)}</span>
                            </div>
                            <p style={css.linhaSub}>uid: {d.uid} · criado: {fmtData(d.criadoEm)}</p>
                        </div>
                    ))}
                </div>
            )}

            {aba === 'saques' && (
                <div style={css.lista}>
                    {saques === null ? (
                        <p style={css.vazio}>Carregando...</p>
                    ) : saques.length === 0 ? (
                        <p style={css.vazio}>Nenhum saque pendente.</p>
                    ) : saques.map(s => (
                        <div key={s.id} style={css.card}>
                            <div style={css.cardTopo}>
                                <span style={css.nome}>₿C {fmtBC(s.valorBC)}</span>
                                <span style={css.saldo}>R$ {Number(s.brlLiquido || 0).toFixed(2)}</span>
                            </div>
                            <p style={css.linha}>
                                🔑 Chave PIX: <strong>{s.chavePix}</strong>
                            </p>
                            <p style={css.linhaSub}>uid: {s.uid} · pedido: {fmtData(s.criadoEm)}</p>
                            <button
                                onClick={() => confirmarSaque(s.id)}
                                disabled={confirmando === s.id}
                                style={{
                                    ...css.btnConfirmar,
                                    opacity: confirmando === s.id ? 0.6 : 1,
                                }}
                            >
                                {confirmando === s.id ? 'Confirmando...' : '✓ Já paguei o PIX — confirmar saque'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const css = {
    container: { display: 'flex', flexDirection: 'column', gap: '14px' },
    titulo:    { fontSize: '18px', fontWeight: '700', color: '#F8FAFC', margin: 0 },
    abas: {
        display: 'flex', gap: '6px', flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px',
    },
    aba: {
        border: 'none', borderRadius: '8px', padding: '7px 12px',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
    },
    erro: {
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#FCA5A5',
    },
    lista: { display: 'flex', flexDirection: 'column', gap: '8px' },
    vazio: { fontSize: '13px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px 0' },
    card: {
        background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px', padding: '12px 14px', display: 'flex',
        flexDirection: 'column', gap: '4px',
    },
    cardTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    nome:   { fontSize: '14px', fontWeight: '600', color: '#F8FAFC' },
    saldo:  { fontSize: '14px', fontWeight: '700', color: '#F59E0B' },
    linha:    { fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: 0 },
    linhaSub: { fontSize: '11px', color: 'rgba(255,255,255,0.30)', margin: 0 },
    uid:      { fontSize: '10px', color: 'rgba(255,255,255,0.20)', margin: '2px 0 0', fontFamily: 'monospace' },
    badgeAdmin: {
        fontSize: '9px', fontWeight: '700', color: '#FCA5A5',
        background: 'rgba(239,68,68,0.15)', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px',
    },
    btnConfirmar: {
        marginTop: '8px', padding: '9px', background: 'rgba(34,197,94,0.15)',
        border: '1px solid rgba(34,197,94,0.4)', borderRadius: '8px', color: '#4ADE80',
        fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
    },
};
