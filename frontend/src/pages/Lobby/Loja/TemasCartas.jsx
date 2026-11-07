/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/TemasCartas.jsx

   MUDANÇAS DESTA VERSÃO:
     → Tema "Royal" adicionado (₿C 1.000, imagem real)
     → PreviewTema suporta imagem quando tema.imagem existe
     → temasComprados recebido via prop do perfil real do jogador
     → CORREÇÃO: props onComprar/onAtivar substituídas por socket
       e onFeedback — compra/ativação aguardam confirmação real
       do backend antes de exibir feedback ao usuário

   TEMAS DISPONÍVEIS:
     Clássico    → gratuito
     4 Cores     → gratuito
     Royal       → ₿C 1.000 (novo, com imagem)
     Neon        → ₿C 500
     Dourado     → ₿C 800
     Minimalista → ₿C 300

   PROPS:
     saldoAtual      → number: saldo REAL em ₿C (bônus não compra tema)
     temaAtual       → string: id do tema ativo
     temasComprados  → string[]: ids dos temas comprados pelo jogador
     socket          → Socket.io (substituiu onComprar/onAtivar)
     onFeedback      → fn(tipo, msg): exibe feedback no pai
================================================================ */

import { useState, useCallback } from 'react';
import Icone from '../../../components/Icone';
import { CartaFace, CartaVerso } from '../../../components/Carta';
import { parsearCarta } from '../../../core/temas';
import PinConfirm from '../../Wallet/PinConfirm';


// ================================================================
// BLOCO 1: CATÁLOGO DE TEMAS
// ================================================================

const TEMAS = [
    {
        id:        'classico',
        nome:      'Clássico',
        preco:     0,
        premium:   false,
        descricao: 'O visual tradicional do poker',
        imagem:    null,
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#DC2626' },
            '♣': { cor: '#1a1a1a' },
            '♠': { cor: '#1a1a1a' },
        },
        verso:  { fundo: '#1E3A8A', detalhe: '#1E40AF' },
        frente: { fundo: '#FFFFFF', borda: '#D1D5DB', raio: 8 },
    },
    {
        id:        'quatroCores',
        nome:      '4 Cores',
        preco:     0,
        premium:   false,
        descricao: 'Cada naipe com sua própria cor',
        imagem:    null,
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#2563EB' },
            '♣': { cor: '#16A34A' },
            '♠': { cor: '#1a1a1a' },
        },
        verso:  { fundo: '#111827', detalhe: '#374151' },
        frente: { fundo: '#FFFFFF', borda: '#9CA3AF', raio: 8 },
    },
    {
        id:        'rivieraNoir',
        nome:      'Riviera Noir',
        premium:   true,
        colecao:   true,
        preco:     2500,
        descricao: 'Cassino de gala dos anos 60: smoking, roleta e dourado sobre preto',
        imagem:    null,
        naipes: {
            '♥': { cor: '#8e1c26' },
            '♦': { cor: '#8e1c26' },
            '♣': { cor: '#151313' },
            '♠': { cor: '#151313' },
        },
        frente: { fundo: '#f6efdf', borda: '#b8913f', raio: 8 },
        verso:  { fundo: '#0e0d0c', detalhe: '#c9a24f' },
    },

    {
        id:        'satoshi',
        nome:      'Satoshi',
        premium:   true,
        colecao:   true,
        preco:     2000,
        descricao: 'Bitcoin e blockchain: circuito laranja sobre grafite',
        imagem:    null,
        naipes: {
            '♥': { cor: '#f7931a' },
            '♦': { cor: '#f7931a' },
            '♣': { cor: '#eae6df' },
            '♠': { cor: '#eae6df' },
        },
        frente: { fundo: '#202326', borda: '#f7931a', raio: 8 },
        verso:  { fundo: '#1a1c1f', detalhe: '#f7931a' },
    },

    {
        id:        'lasVegas',
        nome:      'Las Vegas 1970',
        premium:   true,
        colecao:   true,
        preco:     1500,
        descricao: 'Letreiro de lâmpadas, fichas e cerejas: o cassino retrô',
        imagem:    null,
        naipes: {
            '♥': { cor: '#c8102e' },
            '♦': { cor: '#c8102e' },
            '♣': { cor: '#1d1a17' },
            '♠': { cor: '#1d1a17' },
        },
        frente: { fundo: '#fbf3e2', borda: '#c8102e', raio: 8 },
        verso:  { fundo: '#c8102e', detalhe: '#a50d26' },
    },

    {
        id:        'cyberNeon',
        nome:      'Cyber Neon',
        premium:   true,
        colecao:   true,
        preco:     1500,
        descricao: 'Grade futurista e luz neon roxa e ciano',
        imagem:    null,
        naipes: {
            '♥': { cor: '#ff3fb4' },
            '♦': { cor: '#ff3fb4' },
            '♣': { cor: '#21e6f2' },
            '♠': { cor: '#21e6f2' },
        },
        frente: { fundo: '#120a26', borda: '#21e6f2', raio: 8 },
        verso:  { fundo: '#0b0518', detalhe: '#ff3fb4' },
    },

    {
        id:        'ouroImperial',
        nome:      'Ouro Imperial',
        premium:   true,
        colecao:   true,
        preco:     3000,
        descricao: 'Barroco de palácio: arabescos dourados sobre bordô',
        imagem:    null,
        naipes: {
            '♥': { cor: '#7a1424' },
            '♦': { cor: '#7a1424' },
            '♣': { cor: '#1f1712' },
            '♠': { cor: '#1f1712' },
        },
        frente: { fundo: '#f4e7c8', borda: '#a8822f', raio: 8 },
        verso:  { fundo: '#5e0f1c', detalhe: '#d4a640' },
    },

    {
        id:        'tropicalBrasil',
        nome:      'Tropical Brasil',
        premium:   true,
        colecao:   true,
        preco:     3000,
        descricao: 'Calçadão de Copacabana, folhas e sol',
        imagem:    null,
        naipes: {
            '♥': { cor: '#00873a' },
            '♦': { cor: '#00873a' },
            '♣': { cor: '#0b3d91' },
            '♠': { cor: '#0b3d91' },
        },
        frente: { fundo: '#ffffff', borda: '#009c3b', raio: 8 },
        verso:  { fundo: '#009c3b', detalhe: '#ffdf00' },
    },
];

function fmt(n) {
    return Number(n).toLocaleString('pt-BR');
}

// Temas sempre gratuitos (não precisam estar em temasComprados)
const TEMAS_GRATIS = ['classico', 'quatroCores'];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function TemasCartas({ saldoAtual, temaAtual, temasComprados = [], socket, onFeedback }) {

    const [temaSelecionado, setTemaSelecionado] = useState(
        TEMAS.find(t => t.id === temaAtual) || TEMAS[0]
    );

    // Estado para evitar duplo clique durante operação em curso
    const [operando, setOperando] = useState(false);

    // Tema aguardando confirmação de PIN antes de efetivar a compra —
    // mesma exigência de segurança de depósito/saque/envio de ₿C.
    const [temaPendentePin, setTemaPendentePin] = useState(null);

    // Verifica se o jogador tem um tema
    function estaComprado(tema) {
        if (TEMAS_GRATIS.includes(tema.id)) return true;
        return temasComprados.includes(tema.id);
    }

    // Abre a confirmação de PIN antes de comprar — a compra de verdade só
    // acontece em confirmarCompraComPin, depois do PIN ser validado.
    const handleComprar = useCallback((tema) => {
        if (!socket || operando) return;

        if (saldoAtual < tema.preco) {
            onFeedback('erro', 'Temas só podem ser comprados com saldo real. O bônus serve só para jogar.');
            return;
        }

        setTemaPendentePin(tema);
    }, [socket, operando, saldoAtual, onFeedback]);

    // ✅ Compra real — aguarda tema:comprado ou tema:erro do backend
    const confirmarCompraComPin = useCallback((pin) => {
        const tema = temaPendentePin;
        if (!socket || !tema) return;

        setTemaPendentePin(null);
        setOperando(true);
        socket.emit('comprar_tema', { temaId: tema.id, pin });

        const onComprado = () => {
            setOperando(false);
            onFeedback('sucesso', `Tema "${tema.nome}" comprado com sucesso!`);
            socket.off('tema:comprado', onComprado);
            socket.off('tema:erro',     onErroCompra);
        };
        const onErroCompra = ({ mensagem }) => {
            setOperando(false);
            onFeedback('erro', mensagem || 'Erro ao comprar tema.');
            socket.off('tema:comprado', onComprado);
            socket.off('tema:erro',     onErroCompra);
        };

        socket.on('tema:comprado', onComprado);
        socket.on('tema:erro',     onErroCompra);

        // Timeout de segurança em caso de falha silenciosa
        setTimeout(() => {
            socket.off('tema:comprado', onComprado);
            socket.off('tema:erro',     onErroCompra);
            setOperando(false);
        }, 8000);

    }, [socket, temaPendentePin, onFeedback]);

    // ✅ Ativação real — aguarda tema:ativado ou tema:erro do backend
    const handleAtivar = useCallback((tema) => {
        if (!socket || operando) return;

        setOperando(true);
        socket.emit('ativar_tema', { temaId: tema.id });

        const onAtivado = () => {
            setOperando(false);
            onFeedback('sucesso', `Tema "${tema.nome}" ativado!`);
            socket.off('tema:ativado', onAtivado);
            socket.off('tema:erro',    onErroAtiva);
        };
        const onErroAtiva = ({ mensagem }) => {
            setOperando(false);
            onFeedback('erro', mensagem || 'Erro ao ativar tema.');
            socket.off('tema:ativado', onAtivado);
            socket.off('tema:erro',    onErroAtiva);
        };

        socket.on('tema:ativado', onAtivado);
        socket.on('tema:erro',    onErroAtiva);

        setTimeout(() => {
            socket.off('tema:ativado', onAtivado);
            socket.off('tema:erro',    onErroAtiva);
            setOperando(false);
        }, 5000);

    }, [socket, operando, onFeedback]);

    return (
        <div className="temas">
            <PreviewTema
                tema={temaSelecionado}
                ativo={temaSelecionado.id === temaAtual}
                saldoAtual={saldoAtual}
                comprado={estaComprado(temaSelecionado)}
                operando={operando}
                onComprar={() => handleComprar(temaSelecionado)}
                onAtivar={() => handleAtivar(temaSelecionado)}
            />

            <ul className="temas-grade" aria-label="Temas">
                {TEMAS.map(tema => (
                    <li key={tema.id}>
                        <MiniCardTema
                            tema={tema}
                            selecionado={temaSelecionado.id === tema.id}
                            ativo={temaAtual === tema.id}
                            comprado={estaComprado(tema)}
                            onSelecionar={() => {
                                setTemaSelecionado(tema);
                                if (estaComprado(tema) && tema.id !== temaAtual) {
                                    handleAtivar(tema);
                                }
                            }}
                        />
                    </li>
                ))}
            </ul>

            <p className="cart-nota">O baralho que você usa aparece também para os outros jogadores na mesa. Temas são comprados só com saldo real.</p>

            {temaPendentePin && (
                <PinConfirm
                    titulo="Confirmar compra"
                    descricao={`Tema ${temaPendentePin.nome} por ₿C ${fmt(temaPendentePin.preco)}`}
                    onConfirmar={confirmarCompraComPin}
                    onCancelar={() => setTemaPendentePin(null)}
                />
            )}
        </div>
    );
}

// Cartas de exemplo desenhadas com o mesmo componente da mesa (core/temas.js)
const AS_COPAS = parsearCarta('A♥');
const REI_ESPADAS = parsearCarta('K♠');
const DAMA_OUROS = parsearCarta('Q♦');
const VALETE_PAUS = parsearCarta('J♣');

function PreviewTema({ tema, ativo, saldoAtual, comprado, operando, onComprar, onAtivar }) {
    const temSaldo    = saldoAtual >= tema.preco;
    const podeComprar = tema.premium && !comprado && temSaldo;
    const podeAtivar  = comprado && !ativo;
    const semSaldo    = tema.premium && !comprado && !temSaldo;

    return (
        <section className="tema-preview" aria-labelledby="tema-preview-nome">
            <div className="tema-preview-feltro" aria-hidden="true">
                <div className="tema-preview-cartas">
                    <CartaFace carta={AS_COPAS} largura={56} tema={tema.id} indice />
                    <CartaFace carta={REI_ESPADAS} largura={56} tema={tema.id} indice />
                    <CartaFace carta={DAMA_OUROS} largura={56} tema={tema.id} indice />
                    <CartaFace carta={VALETE_PAUS} largura={56} tema={tema.id} indice />
                    <CartaVerso largura={56} tema={tema.id} />
                </div>
            </div>

            <div className="tema-preview-info">
                <div className="tema-preview-titulo">
                    <h3 id="tema-preview-nome">{tema.nome}</h3>
                    {ativo && <span className="etiqueta-moeda">Em uso</span>}
                    {comprado && !ativo && tema.premium && <span className="etiqueta-moeda">Comprado</span>}
                </div>
                <p className="cart-nota">{tema.descricao}</p>
                <p className="tema-preco num">
                    {tema.premium ? <>₿C {fmt(tema.preco)}</> : 'Grátis'}
                    {semSaldo && <span className="tema-sem-saldo"> · saldo real insuficiente</span>}
                </p>

                {ativo ? (
                    <p className="tema-em-uso"><Icone nome="check" tamanho={16} />Este é o seu baralho</p>
                ) : podeAtivar ? (
                    <button type="button" onClick={onAtivar} disabled={operando} aria-busy={operando || undefined} className="btn btn-neutro cart-btn-cheio">
                        {operando ? 'Ativando…' : 'Usar este baralho'}
                    </button>
                ) : podeComprar ? (
                    <button type="button" onClick={onComprar} disabled={operando} aria-busy={operando || undefined} className="btn btn-principal cart-btn-cheio">
                        {operando ? 'Comprando…' : `Comprar por ₿C ${fmt(tema.preco)}`}
                    </button>
                ) : semSaldo ? (
                    <button type="button" disabled className="btn btn-principal cart-btn-cheio">Falta saldo para comprar</button>
                ) : null}
            </div>
        </section>
    );
}

function MiniCardTema({ tema, selecionado, ativo, comprado, onSelecionar }) {
    return (
        <button type="button" onClick={onSelecionar} className="tema-mini" aria-pressed={selecionado} aria-label={`${tema.nome}${ativo ? ', em uso' : comprado ? ', disponível' : `, ₿C ${fmt(tema.preco)}`}`}>
            <span className="tema-mini-cartas" aria-hidden="true">
                <CartaFace carta={AS_COPAS} largura={30} tema={tema.id} />
                <CartaVerso largura={30} tema={tema.id} />
            </span>
            <span className="tema-mini-nome">{tema.nome}</span>
            <span className="tema-mini-preco num">
                {ativo ? 'Em uso' : comprado ? (tema.premium ? 'Comprado' : 'Grátis') : `₿C ${fmt(tema.preco)}`}
            </span>
        </button>
    );
}
