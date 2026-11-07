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

   Estilos em styles/ranking-admin.css (prefixo adm-).

   PROPS:
     socket → Socket.io já autenticado
================================================================ */

import { useState, useEffect, useRef } from 'react';
import Icone from '../../components/Icone';
import '../../styles/ranking-admin.css';

function fmtBC(n) { return Number(n || 0).toLocaleString('pt-BR'); }
function fmtBRL(n) {
    return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

const ABAS = [
    { id: 'usuarios',  label: 'Usuários' },
    { id: 'depositos', label: 'Depósitos pendentes' },
    { id: 'saques',    label: 'Saques pendentes' },
];

export default function Admin({ socket }) {

    const [aba, setAba] = useState('usuarios');

    const [usuarios,  setUsuarios ] = useState(null);
    const [depositos, setDepositos] = useState(null);
    const [saques,    setSaques   ] = useState(null);
    const [erro,      setErro     ] = useState(null);
    const [confirmando, setConfirmando] = useState(null); // saqueId enviado ao servidor
    const [aConfirmar,  setAConfirmar ] = useState(null); // saqueId aguardando o "sim" do admin
    const [pixCopiado,  setPixCopiado ] = useState(null); // saqueId da última chave PIX copiada
    const [busca,       setBusca      ] = useState('');
    const timerPix = useRef(null);

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
            setAConfirmar(null);
            socket.emit('admin:listar_saques_pendentes');
        };
        const onErro = ({ mensagem }) => { setErro(mensagem); setConfirmando(null); };

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

    useEffect(() => () => clearTimeout(timerPix.current), []);

    function carregar(id) {
        if (!socket) return;
        if (id === 'usuarios')  socket.emit('admin:listar_usuarios');
        if (id === 'depositos') socket.emit('admin:listar_depositos_pendentes');
        if (id === 'saques')    socket.emit('admin:listar_saques_pendentes');
    }

    // Busca os dados da aba ativa ao trocar
    useEffect(() => {
        if (!socket) return;
        if (aba === 'usuarios')  socket.emit('admin:listar_usuarios');
        if (aba === 'depositos') socket.emit('admin:listar_depositos_pendentes');
        if (aba === 'saques')    socket.emit('admin:listar_saques_pendentes');
    }, [socket, aba]);

    function trocarAba(id) {
        setErro(null);
        setAConfirmar(null);
        setAba(id);
    }

    function confirmarSaque(saqueId) {
        if (!socket) return;
        setConfirmando(saqueId);
        socket.emit('admin:confirmar_saque', { saqueId });
    }

    function copiarPix(saqueId, chavePix) {
        navigator.clipboard.writeText(chavePix).then(() => {
            setPixCopiado(saqueId);
            clearTimeout(timerPix.current);
            timerPix.current = setTimeout(() => setPixCopiado(null), 2000);
        }).catch(() => setErro('Não foi possível copiar. Selecione a chave e copie manualmente.'));
    }

    const contagem = { usuarios: usuarios?.length, depositos: depositos?.length, saques: saques?.length };
    const termo = busca.trim().toLowerCase();
    const usuariosFiltrados = usuarios && termo
        ? usuarios.filter(u => [u.nome, u.email, u.uid].some(v => (v || '').toLowerCase().includes(termo)))
        : usuarios;

    return (
        <div className="adm">
            <div className="adm-cab">
                <h2>Painel de admin</h2>
                <button type="button" className="adm-btn neutro" onClick={() => { setErro(null); carregar(aba); }}>
                    <Icone nome="historico" /> Atualizar
                </button>
            </div>

            <div className="adm-abas" role="tablist" aria-label="Seções do painel">
                {ABAS.map(a => (
                    <button
                        key={a.id}
                        type="button"
                        role="tab"
                        id={`adm-aba-${a.id}`}
                        aria-selected={aba === a.id}
                        aria-controls="adm-painel"
                        className="adm-aba"
                        onClick={() => trocarAba(a.id)}
                    >
                        {a.label}
                        {contagem[a.id] != null && <span className="cont">{contagem[a.id]}</span>}
                    </button>
                ))}
            </div>

            <div id="adm-painel" role="tabpanel" aria-labelledby={`adm-aba-${aba}`} className="adm">

                {erro && (
                    <p className="adm-erro" role="alert">
                        <span><Icone nome="alerta" /> {erro}</span>
                        <button type="button" className="adm-btn neutro" onClick={() => { setErro(null); carregar(aba); }}>
                            Tentar de novo
                        </button>
                    </p>
                )}

                {aba === 'usuarios' && (
                    usuarios === null ? <Esqueleto /> : (
                        <>
                            <div className="adm-barra">
                                <label className="adm-busca">
                                    <Icone nome="busca" tamanho={18} />
                                    <span className="so-leitor">Buscar usuário</span>
                                    <input
                                        type="search"
                                        value={busca}
                                        onChange={e => setBusca(e.target.value)}
                                        placeholder="Buscar por nome, email ou uid"
                                        autoComplete="off"
                                    />
                                </label>
                                <span className="adm-total" aria-live="polite">
                                    {termo ? `${usuariosFiltrados.length} de ${usuarios.length}` : `${usuarios.length}`} usuários
                                </span>
                            </div>
                            {usuariosFiltrados.length === 0 ? (
                                <Vazio icone="usuarios" titulo={termo ? 'Nenhum resultado' : 'Nenhum usuário encontrado'}
                                    texto={termo ? 'Nenhum usuário bate com essa busca.' : 'Quando alguém se cadastrar, aparece aqui.'} />
                            ) : (
                                <table className="adm-tab">
                                    <thead>
                                        <tr>
                                            <th scope="col">Usuário</th>
                                            <th scope="col" className="dir">Saldo</th>
                                            <th scope="col" className="dir">Bônus</th>
                                            <th scope="col" className="dir">Sacado hoje</th>
                                            <th scope="col">PIN</th>
                                            <th scope="col">Criado em</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usuariosFiltrados.map(u => (
                                            <tr key={u.uid}>
                                                <td className="principal">
                                                    <span className="adm-nome">
                                                        {u.nome || '(sem nome)'}
                                                        {u.isAdmin && <span className="adm-tag">Admin</span>}
                                                    </span>
                                                    <span className="adm-email">{u.email || '(sem email)'}</span>
                                                    <span className="adm-uid">{u.uid}</span>
                                                </td>
                                                <td data-rotulo="Saldo" className="dir tnum adm-bc">₿C {fmtBC(u.saldo)}</td>
                                                <td data-rotulo="Bônus" className="dir tnum">₿C {fmtBC(u.saldoBonus)}</td>
                                                <td data-rotulo="Sacado hoje" className="dir tnum">₿C {fmtBC(u.sacadoHoje)}</td>
                                                <td data-rotulo="PIN">
                                                    {u.temPin
                                                        ? <span className="adm-sim"><Icone nome="check" /> Definido</span>
                                                        : <span className="adm-nao">Não definido</span>}
                                                </td>
                                                <td data-rotulo="Criado em" className="tnum">{fmtData(u.criadoEm)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )
                )}

                {aba === 'depositos' && (
                    depositos === null ? <Esqueleto /> :
                    depositos.length === 0 ? (
                        <Vazio icone="baixo" titulo="Nenhum depósito pendente" texto="Os depósitos aguardando confirmação aparecem aqui." />
                    ) : (
                        <table className="adm-tab">
                            <thead>
                                <tr>
                                    <th scope="col" className="dir">Valor pago</th>
                                    <th scope="col" className="dir">₿C a creditar</th>
                                    <th scope="col">Jogador (uid)</th>
                                    <th scope="col">Criado em</th>
                                </tr>
                            </thead>
                            <tbody>
                                {depositos.map(d => (
                                    <tr key={d.id}>
                                        <td data-rotulo="Valor pago" className="dir tnum"><b>R$ {fmtBRL(d.totalBRL)}</b></td>
                                        <td data-rotulo="₿C a creditar" className="dir tnum adm-bc">₿C {fmtBC(d.bcCreditar)}</td>
                                        <td data-rotulo="Jogador"><span className="adm-uid" style={{ marginTop: 0 }}>{d.uid}</span></td>
                                        <td data-rotulo="Criado em" className="tnum">{fmtData(d.criadoEm)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {aba === 'saques' && (
                    saques === null ? <Esqueleto /> :
                    saques.length === 0 ? (
                        <Vazio icone="cima" titulo="Nenhum saque pendente" texto="Os pedidos de saque aguardando o PIX aparecem aqui." />
                    ) : (
                        <ul className="adm-saques">
                            {saques.map(s => (
                                <li key={s.id} className="adm-saque">
                                    <div className="adm-saque-valores">
                                        <div>
                                            <span className="pagar">Pagar via PIX</span>
                                            <span className="brl">R$ {fmtBRL(s.brlLiquido)}</span>
                                        </div>
                                        <span className="bc">Saque de ₿C {fmtBC(s.valorBC)}</span>
                                    </div>

                                    <dl className="adm-dados">
                                        <div>
                                            <dt>Titular da conta</dt>
                                            <dd>
                                                {s.nomeTitular}
                                                {s.emailTitular && <small>{s.emailTitular}</small>}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Chave PIX</dt>
                                            <dd className="adm-pix">
                                                <code>{s.chavePix}</code>
                                                <button
                                                    type="button"
                                                    className={`adm-btn neutro${pixCopiado === s.id ? ' copiado' : ''}`}
                                                    onClick={() => copiarPix(s.id, s.chavePix)}
                                                    aria-label={`Copiar chave PIX de ${s.nomeTitular}`}
                                                >
                                                    <Icone nome={pixCopiado === s.id ? 'check' : 'copiar'} />
                                                    {pixCopiado === s.id ? 'Copiado' : 'Copiar'}
                                                </button>
                                            </dd>
                                        </div>
                                    </dl>

                                    <p className="adm-confira">
                                        <Icone nome="alerta" />
                                        <span>Confira se o nome do titular da conta bancária da chave PIX bate com o nome acima antes de confirmar.</span>
                                    </p>

                                    <p className="adm-meta">
                                        Pedido em {fmtData(s.criadoEm)} · uid <span className="adm-uid">{s.uid}</span>
                                    </p>

                                    <div className="adm-lado">
                                        {aConfirmar === s.id ? (
                                            <div className="adm-sure" role="group" aria-label="Confirmar saque">
                                                <p>
                                                    Você enviou <b>R$ {fmtBRL(s.brlLiquido)}</b> para <b>{s.nomeTitular}</b>?
                                                    Ao confirmar, o saque sai da fila e não volta.
                                                </p>
                                                <div className="adm-sure-acoes">
                                                    <button
                                                        type="button"
                                                        className="adm-btn neutro"
                                                        autoFocus
                                                        disabled={confirmando === s.id}
                                                        onClick={() => setAConfirmar(null)}
                                                    >
                                                        Voltar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="adm-btn positivo"
                                                        disabled={confirmando === s.id}
                                                        aria-busy={confirmando === s.id}
                                                        onClick={() => confirmarSaque(s.id)}
                                                    >
                                                        {confirmando === s.id ? 'Confirmando...' : 'Sim, já paguei'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="adm-acao">
                                                <button type="button" className="adm-btn contorno" onClick={() => setAConfirmar(s.id)}>
                                                    <Icone nome="check" /> Já paguei o PIX
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                )}
            </div>
        </div>
    );
}

function Vazio({ icone, titulo, texto }) {
    return (
        <p className="adm-vazio">
            <Icone nome={icone} />
            <b>{titulo}</b>
            <span>{texto}</span>
        </p>
    );
}

function Esqueleto() {
    return (
        <ul className="adm-esq" role="status" aria-label="Carregando">
            <li /><li /><li /><li />
        </ul>
    );
}
