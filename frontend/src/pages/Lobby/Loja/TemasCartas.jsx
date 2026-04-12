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
     saldoAtual      → number: saldo atual em ₿C
     temaAtual       → string: id do tema ativo
     temasComprados  → string[]: ids dos temas comprados pelo jogador
     socket          → Socket.io (substituiu onComprar/onAtivar)
     onFeedback      → fn(tipo, msg): exibe feedback no pai
================================================================ */

import { useState, useCallback } from 'react';


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
        id:        'royal',
        nome:      'Royal',
        preco:     1000,
        premium:   true,
        descricao: 'Elegância vitoriana com detalhes dourados',
        // Coloque a imagem em: frontend/public/temas/royal-card.png
        imagem:    '/temas/royal-card.png',
        naipes: {
            '♥': { cor: '#C0392B' },
            '♦': { cor: '#C0392B' },
            '♣': { cor: '#2C1810' },
            '♠': { cor: '#2C1810' },
        },
        verso:  { fundo: '#6B0F1A', detalhe: '#8B1A2A' },
        frente: { fundo: '#FFFBEB', borda: '#8B6914', raio: 8 },
    },
    {
        id:        'neon',
        nome:      'Neon',
        preco:     500,
        premium:   true,
        descricao: 'Visual futurista com brilhos neon',
        imagem:    null,
        naipes: {
            '♥': { cor: '#F472B6' },
            '♦': { cor: '#34D399' },
            '♣': { cor: '#60A5FA' },
            '♠': { cor: '#A78BFA' },
        },
        verso:  { fundo: '#0F0F1A', detalhe: '#7C3AED' },
        frente: { fundo: '#0F172A', borda: '#7C3AED', raio: 10 },
    },
    {
        id:        'dourado',
        nome:      'Dourado',
        preco:     800,
        premium:   true,
        descricao: 'Luxo e elegância em tons de ouro',
        imagem:    null,
        naipes: {
            '♥': { cor: '#EF4444' },
            '♦': { cor: '#F59E0B' },
            '♣': { cor: '#92400E' },
            '♠': { cor: '#78350F' },
        },
        verso:  { fundo: '#78350F', detalhe: '#B45309' },
        frente: { fundo: '#FFFBEB', borda: '#D97706', raio: 8 },
    },
    {
        id:        'minimalista',
        nome:      'Minimalista',
        preco:     300,
        premium:   true,
        descricao: 'Design clean e moderno',
        imagem:    null,
        naipes: {
            '♥': { cor: '#6B7280' },
            '♦': { cor: '#6B7280' },
            '♣': { cor: '#374151' },
            '♠': { cor: '#374151' },
        },
        verso:  { fundo: '#F9FAFB', detalhe: '#E5E7EB' },
        frente: { fundo: '#FFFFFF', borda: '#E5E7EB', raio: 4 },
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

    // Verifica se o jogador tem um tema
    function estaComprado(tema) {
        if (TEMAS_GRATIS.includes(tema.id)) return true;
        return temasComprados.includes(tema.id);
    }

    // ✅ Compra real — aguarda tema:comprado ou tema:erro do backend
    const handleComprar = useCallback((tema) => {
        if (!socket || operando) return;

        if (saldoAtual < tema.preco) {
            onFeedback('erro', 'Saldo insuficiente de ₿C.');
            return;
        }

        setOperando(true);
        socket.emit('comprar_tema', { temaId: tema.id });

        socket.once('tema:comprado', () => {
            setOperando(false);
            onFeedback('sucesso', `Tema "${tema.nome}" comprado com sucesso!`);
        });

        socket.once('tema:erro', ({ mensagem }) => {
            setOperando(false);
            onFeedback('erro', mensagem || 'Erro ao comprar tema.');
        });

        // Timeout de segurança em caso de falha silenciosa
        setTimeout(() => {
            setOperando(false);
            socket.off('tema:comprado');
            socket.off('tema:erro');
        }, 8000);

    }, [socket, operando, saldoAtual, onFeedback]);

    // ✅ Ativação real — aguarda tema:ativado ou tema:erro do backend
    const handleAtivar = useCallback((tema) => {
        if (!socket || operando) return;

        setOperando(true);
        socket.emit('ativar_tema', { temaId: tema.id });

        socket.once('tema:ativado', () => {
            setOperando(false);
            onFeedback('sucesso', `Tema "${tema.nome}" ativado!`);
        });

        socket.once('tema:erro', ({ mensagem }) => {
            setOperando(false);
            onFeedback('erro', mensagem || 'Erro ao ativar tema.');
        });

        setTimeout(() => {
            setOperando(false);
            socket.off('tema:ativado');
            socket.off('tema:erro');
        }, 5000);

    }, [socket, operando, onFeedback]);

    return (
        <div style={estilos.container}>

            <PreviewTema
                tema={temaSelecionado}
                ativo={temaSelecionado.id === temaAtual}
                saldoAtual={saldoAtual}
                comprado={estaComprado(temaSelecionado)}
                operando={operando}
                onComprar={() => handleComprar(temaSelecionado)}
                onAtivar={() => handleAtivar(temaSelecionado)}
            />

            <div style={estilos.divisor}>
                <div style={estilos.linhaDivisor} />
                <span style={estilos.textDivisor}>escolha um tema</span>
                <div style={estilos.linhaDivisor} />
            </div>

            <div style={estilos.grade}>
                {TEMAS.map(tema => (
                    <MiniCardTema
                        key={tema.id}
                        tema={tema}
                        selecionado={temaSelecionado.id === tema.id}
                        ativo={temaAtual === tema.id}
                        comprado={estaComprado(tema)}
                        onSelecionar={() => setTemaSelecionado(tema)}
                    />
                ))}
            </div>

            <p style={estilos.avisoSaldo}>
                Seu saldo:{' '}
                <span style={{ color: '#F59E0B', fontWeight: '600' }}>
                    ₿C {fmt(saldoAtual)}
                </span>
            </p>

        </div>
    );
}


// ================================================================
// BLOCO 3: PREVIEW DO TEMA
// Exibe imagem real se tema.imagem existir,
// ou o preview de cartas gerado por CSS se não houver imagem.
// ================================================================

function PreviewTema({ tema, ativo, saldoAtual, comprado, operando, onComprar, onAtivar }) {

    const temSaldo    = saldoAtual >= tema.preco;
    const podeComprar = tema.premium && !comprado && temSaldo;
    const podeAtivar  = comprado && !ativo;
    const semSaldo    = tema.premium && !comprado && !temSaldo;

    return (
        <div style={estilos.previewContainer}>

            {/* ---- Área visual: imagem ou cartas CSS ---- */}
            <div style={estilos.cartasExemplo}>
                {tema.imagem ? (
                    // Tema com imagem real (ex: Royal)
                    <div style={estilos.imagemContainer}>
                        <img
                            src={tema.imagem}
                            alt={`Tema ${tema.nome}`}
                            style={estilos.imagemTema}
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                        {/* Badge de destaque sobre a imagem */}
                        {tema.premium && (
                            <div style={estilos.imagemBadge}>
                                ✨ PREMIUM
                            </div>
                        )}
                    </div>
                ) : (
                    // Preview CSS das cartas
                    <>
                        <div style={{
                            ...estilos.cartaFrente,
                            background:   tema.frente.fundo,
                            border:       `2px solid ${tema.frente.borda}`,
                            borderRadius: tema.frente.raio + 'px',
                            boxShadow:    tema.id === 'neon'
                                ? `0 0 20px ${tema.naipes['♥'].cor}40`
                                : '0 4px 12px rgba(0,0,0,0.3)',
                        }}>
                            <div style={{ ...estilos.cartaValorCanto, color: tema.naipes['♥'].cor }}>
                                <span style={estilos.cartaValorTexto}>A</span>
                                <span style={estilos.cartaNaipeCanto}>♥</span>
                            </div>
                            <span style={{
                                fontSize:   '38px',
                                color:      tema.naipes['♥'].cor,
                                lineHeight: 1,
                                filter:     tema.id === 'neon'
                                    ? `drop-shadow(0 0 8px ${tema.naipes['♥'].cor})`
                                    : 'none',
                            }}>♥</span>
                            <div style={{
                                ...estilos.cartaValorCanto,
                                position:  'absolute',
                                bottom:    '6px',
                                right:     '6px',
                                transform: 'rotate(180deg)',
                                color:     tema.naipes['♥'].cor,
                            }}>
                                <span style={estilos.cartaValorTexto}>A</span>
                                <span style={estilos.cartaNaipeCanto}>♥</span>
                            </div>
                        </div>

                        <div style={{
                            ...estilos.cartaVerso,
                            background:   tema.verso.fundo,
                            borderRadius: tema.frente.raio + 'px',
                        }}>
                            <div style={{
                                ...estilos.cartaVersoInterno,
                                background:   tema.verso.detalhe,
                                borderRadius: (tema.frente.raio - 2) + 'px',
                                opacity:      tema.id === 'minimalista' ? 0.6 : 0.35,
                            }} />
                        </div>

                        <div style={estilos.naipesGrid}>
                            {Object.entries(tema.naipes).map(([naipe, config]) => (
                                <div key={naipe} style={{ textAlign: 'center' }}>
                                    <span style={{
                                        fontSize: '20px',
                                        color:    config.cor,
                                        filter:   tema.id === 'neon'
                                            ? `drop-shadow(0 0 4px ${config.cor})`
                                            : 'none',
                                    }}>
                                        {naipe}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ---- Info e botões ---- */}
            <div style={estilos.previewInfo}>

                <div style={estilos.previewTitulo}>
                    <h3 style={estilos.temaNome}>{tema.nome}</h3>
                    {tema.premium && <span style={estilos.badgePremium}>PREMIUM</span>}
                    {ativo       && <span style={estilos.badgeAtivo}>ATIVO</span>}
                    {comprado && !ativo && tema.premium && (
                        <span style={estilos.badgeComprado}>COMPRADO</span>
                    )}
                </div>

                <p style={estilos.temaDescricao}>{tema.descricao}</p>

                {tema.premium ? (
                    <p style={estilos.temaPreco}>
                        <span style={{ color: '#F59E0B', fontWeight: '700' }}>
                            ₿C {fmt(tema.preco)}
                        </span>
                        {semSaldo && (
                            <span style={{ color: '#EF4444', fontSize: '11px', marginLeft: '6px' }}>
                                (saldo insuficiente)
                            </span>
                        )}
                    </p>
                ) : (
                    <p style={{ ...estilos.temaPreco, color: '#22C55E' }}>Gratuito</p>
                )}

                {ativo ? (
                    <div style={estilos.btnAtivo}>✓ Tema ativo</div>
                ) : podeAtivar ? (
                    <button
                        onClick={onAtivar}
                        disabled={operando}
                        style={{
                            ...estilos.btnAtivar,
                            opacity: operando ? 0.6 : 1,
                            cursor:  operando ? 'wait' : 'pointer',
                        }}
                    >
                        {operando ? 'Ativando...' : 'Usar este tema'}
                    </button>
                ) : podeComprar ? (
                    <button
                        onClick={onComprar}
                        disabled={operando}
                        style={{
                            ...estilos.btnComprar,
                            opacity: operando ? 0.6 : 1,
                            cursor:  operando ? 'wait' : 'pointer',
                        }}
                    >
                        {operando ? 'Comprando...' : `Comprar · ₿C ${fmt(tema.preco)}`}
                    </button>
                ) : semSaldo ? (
                    <button disabled style={{ ...estilos.btnComprar, opacity: 0.4, cursor: 'not-allowed' }}>
                        ₿C insuficiente
                    </button>
                ) : null}

            </div>
        </div>
    );
}


// ================================================================
// BLOCO 4: MINI CARD
// ================================================================

function MiniCardTema({ tema, selecionado, ativo, comprado, onSelecionar }) {
    return (
        <button
            onClick={onSelecionar}
            style={{
                ...estilos.miniCard,
                border: selecionado
                    ? '2px solid #7C3AED'
                    : ativo
                        ? '2px solid #22C55E'
                        : '1px solid rgba(255,255,255,0.07)',
                background: selecionado
                    ? 'rgba(124,58,237,0.1)'
                    : 'rgba(255,255,255,0.02)',
                transform: selecionado ? 'scale(1.03)' : 'scale(1)',
            }}
        >
            {/* Preview: imagem ou cartas CSS */}
            {tema.imagem ? (
                <div style={estilos.miniImagemContainer}>
                    <img
                        src={tema.imagem}
                        alt={tema.nome}
                        style={estilos.miniImagem}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                </div>
            ) : (
                <div style={estilos.miniPreview}>
                    <div style={{
                        ...estilos.miniCarta,
                        background:   tema.frente.fundo,
                        border:       `1px solid ${tema.frente.borda}`,
                        borderRadius: (tema.frente.raio / 2) + 'px',
                        color:        tema.naipes['♥'].cor,
                    }}>
                        <span style={{ fontSize: '12px', lineHeight: 1 }}>A♥</span>
                    </div>
                    <div style={{
                        ...estilos.miniCarta,
                        background:   tema.verso.fundo,
                        border:       '1px solid rgba(255,255,255,0.1)',
                        borderRadius: (tema.frente.raio / 2) + 'px',
                    }}>
                        <div style={{
                            width: '14px', height: '20px',
                            background:   tema.verso.detalhe,
                            borderRadius: '2px', opacity: 0.4,
                        }} />
                    </div>
                </div>
            )}

            <span style={{
                ...estilos.miniNome,
                color:      selecionado ? '#A78BFA' : ativo ? '#22C55E' : 'rgba(255,255,255,0.6)',
                fontWeight: selecionado || ativo ? '600' : '400',
            }}>
                {tema.nome}
            </span>

            {ativo && <span style={estilos.miniAtivo}>ativo</span>}
            {tema.premium && !comprado && (
                <span style={estilos.miniPreco}>₿C {fmt(tema.preco)}</span>
            )}
            {tema.premium && comprado && !ativo && (
                <span style={{ ...estilos.miniPreco, color: '#22C55E' }}>comprado</span>
            )}
            {!tema.premium && !ativo && (
                <span style={{ ...estilos.miniPreco, color: '#22C55E' }}>grátis</span>
            )}
        </button>
    );
}


// ================================================================
// BLOCO 5: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '16px',
    },

    previewContainer: {
        background:    '#111827',
        border:        '1px solid rgba(255,255,255,0.07)',
        borderRadius:  '14px',
        padding:       '16px',
        display:       'flex',
        gap:           '16px',
        alignItems:    'flex-start',
    },

    cartasExemplo: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        flexShrink:     0,
    },

    // Imagem real do tema
    imagemContainer: {
        position:     'relative',
        width:        '100px',
        flexShrink:   0,
    },

    imagemTema: {
        width:        '100px',
        height:       '140px',
        objectFit:    'cover',
        borderRadius: '10px',
        border:       '2px solid rgba(139,105,20,0.6)',
        boxShadow:    '0 4px 20px rgba(139,105,20,0.30)',
        display:      'block',
    },

    imagemBadge: {
        position:      'absolute',
        bottom:        '6px',
        left:          '50%',
        transform:     'translateX(-50%)',
        background:    'rgba(0,0,0,0.75)',
        color:         '#F59E0B',
        fontSize:      '9px',
        fontWeight:    '700',
        padding:       '2px 8px',
        borderRadius:  '10px',
        whiteSpace:    'nowrap',
        letterSpacing: '0.05em',
    },

    // Cartas CSS
    cartaFrente: {
        width:          '70px',
        height:         '98px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        transition:     'all 0.3s',
    },

    cartaValorCanto: {
        position:      'absolute',
        top:           '6px',
        left:          '6px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        lineHeight:    1,
    },

    cartaValorTexto: { fontSize: '13px', fontWeight: '800', lineHeight: 1 },
    cartaNaipeCanto: { fontSize: '11px', lineHeight: 1 },

    cartaVerso: {
        width:          '70px',
        height:         '98px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        transition:     'all 0.3s',
    },

    cartaVersoInterno: { width: '58px', height: '86px' },

    naipesGrid: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '2px',
        width:               '70px',
    },

    // Info do tema
    previewInfo: {
        flex:          1,
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    previewTitulo: {
        display:  'flex',
        alignItems:'center',
        gap:      '6px',
        flexWrap: 'wrap',
    },

    temaNome: { fontSize: '16px', fontWeight: '700', color: '#F8FAFC', margin: 0 },

    badgePremium: {
        fontSize: '9px', fontWeight: '700',
        background: 'rgba(217,119,6,0.2)', color: '#F59E0B',
        padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.05em',
    },

    badgeAtivo: {
        fontSize: '9px', fontWeight: '700',
        background: 'rgba(34,197,94,0.2)', color: '#22C55E',
        padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.05em',
    },

    badgeComprado: {
        fontSize: '9px', fontWeight: '700',
        background: 'rgba(124,58,237,0.2)', color: '#A78BFA',
        padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.05em',
    },

    temaDescricao: { fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.4 },
    temaPreco:     { fontSize: '14px', fontWeight: '500', color: '#F8FAFC', margin: 0 },

    btnAtivo: {
        padding: '8px 12px', background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px',
        color: '#22C55E', fontSize: '13px', fontWeight: '600',
        textAlign: 'center', marginTop: 'auto',
    },

    btnAtivar: {
        padding: '8px 12px', background: 'rgba(124,58,237,0.15)',
        border: '1px solid rgba(124,58,237,0.4)', borderRadius: '8px',
        color: '#A78BFA', fontSize: '13px', fontWeight: '600',
        cursor: 'pointer', marginTop: 'auto', outline: 'none',
        WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
    },

    btnComprar: {
        padding: '8px 12px', background: 'linear-gradient(135deg, #D97706, #F59E0B)',
        border: 'none', borderRadius: '8px', color: 'white',
        fontSize: '13px', fontWeight: '600', cursor: 'pointer',
        marginTop: 'auto', outline: 'none', fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    divisor:     { display: 'flex', alignItems: 'center', gap: '8px' },
    linhaDivisor:{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' },
    textDivisor: {
        fontSize: '10px', color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
    },

    grade: {
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:                 '8px',
    },

    miniCard: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '6px', padding: '10px 6px', borderRadius: '10px',
        cursor: 'pointer', transition: 'all 0.2s',
        WebkitTapHighlightColor: 'transparent', outline: 'none',
    },

    // Mini imagem
    miniImagemContainer: {
        width: '44px', height: '56px', overflow: 'hidden',
        borderRadius: '6px', border: '1px solid rgba(139,105,20,0.4)',
    },

    miniImagem: {
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    },

    miniPreview: { display: 'flex', gap: '3px' },

    miniCarta: {
        width: '24px', height: '34px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: '700',
    },

    miniNome:  { fontSize: '10px', textAlign: 'center', lineHeight: 1.2 },
    miniAtivo: {
        fontSize: '9px', background: 'rgba(34,197,94,0.15)', color: '#22C55E',
        padding: '1px 5px', borderRadius: '3px', fontWeight: '600',
    },
    miniPreco: { fontSize: '9px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' },

    avisoSaldo: { fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 },
};
