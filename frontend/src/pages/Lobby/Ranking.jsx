/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Ranking.jsx

   CONCEITO GERAL:
   Exibe o ranking dos melhores jogadores do jogo.
   Duas categorias:
     → Top ₿C     : quem tem mais Bitchager acumulado
     → Top Pontos  : quem tem mais pontos de rank (mais partidas ganhas)

   O jogador atual aparece destacado na lista
   mesmo que não esteja no top 10.

   PROPS:
     ranking → array de jogadores ordenado pelo servidor
               [ { uid, nome, avatar, fichasLiquidas, vitorias, posicao } ]
               (saldo/rankPontos também aceitos, usados nos dados de exemplo)
     meuUid  → string: uid do jogador logado (para destacar)
================================================================ */

import { useState } from 'react';


// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

// Medalha para os 3 primeiros lugares
function medalha(posicao) {
    if (posicao === 1) return { emoji: '🥇', cor: 'var(--cor-destaque-texto)' };
    if (posicao === 2) return { emoji: '🥈', cor: 'var(--cor-texto-2)' };
    if (posicao === 3) return { emoji: '🥉', cor: 'var(--cor-destaque-texto)' };
    return { emoji: null, cor: 'var(--cor-linha-forte)' };
}

// Formata número grande de forma compacta
// Ex: 12500 → "12,5K", 1200000 → "1,2M"
function fmtCompacto(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return String(n);
}

// Dados de exemplo enquanto o backend não envia o ranking real
// No projeto real, esses dados vêm do Supabase via servidor
const RANKING_EXEMPLO = [
    { uid: 'u1', nome: 'Terminator',  avatar: '', saldo: 125000, rankPontos: 8420, posicao: 1 },
    { uid: 'u2', nome: 'SkyNet',      avatar: '', saldo: 98500,  rankPontos: 7100, posicao: 2 },
    { uid: 'u3', nome: 'Matrix',      avatar: '', saldo: 87200,  rankPontos: 6350, posicao: 3 },
    { uid: 'u4', nome: 'Viper',       avatar: '', saldo: 72000,  rankPontos: 5800, posicao: 4 },
    { uid: 'u5', nome: '007-Bot',     avatar: '', saldo: 65400,  rankPontos: 4920, posicao: 5 },
    { uid: 'u6', nome: 'R2-D2',       avatar: '', saldo: 54000,  rankPontos: 4100, posicao: 6 },
    { uid: 'u7', nome: 'Rookie',      avatar: '', saldo: 43200,  rankPontos: 3200, posicao: 7 },
    { uid: 'u8', nome: 'Fishinho',    avatar: '', saldo: 38900,  rankPontos: 2800, posicao: 8 },
    { uid: 'u9', nome: 'Sortudo',     avatar: '', saldo: 31200,  rankPontos: 2100, posicao: 9 },
    { uid: 'u10', nome: 'Rookie Jr.', avatar: '', saldo: 22000,  rankPontos: 1400, posicao: 10 },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Ranking({ ranking = [], meuUid }) {

    // Qual categoria está selecionada
    const [categoria, setCategoria] = useState('saldo');

    // Usa dados de exemplo se o ranking vier vazio
    // O servidor (GET /ranking → buscarRanking) manda `fichasLiquidas` e
    // `vitorias`; os dados de exemplo usam `saldo` e `rankPontos`. Normaliza
    // para os nomes que o componente usa, com fallback para 0 (nunca undefined).
    const dados = (ranking.length > 0 ? ranking : RANKING_EXEMPLO).map(j => ({
        ...j,
        saldo:      j.fichasLiquidas ?? j.saldo ?? 0,
        rankPontos: j.vitorias       ?? j.rankPontos ?? 0,
    }));

    // Ordena conforme a categoria selecionada
    const dadosOrdenados = [...dados].sort((a, b) =>
        categoria === 'saldo'
            ? b.saldo - a.saldo
            : b.rankPontos - a.rankPontos
    ).map((j, i) => ({ ...j, posicao: i + 1 }));

    // Encontra a posição do jogador atual na lista
    const minhaposicao = dadosOrdenados.findIndex(j => j.uid === meuUid);


    return (
        <div style={estilos.container}>

            {/* ---- Seletor de categoria ---- */}
            <div style={estilos.seletorCategoria}>
                <BotaoCategoria
                    ativo={categoria === 'saldo'}
                    onClick={() => setCategoria('saldo')}
                    icone="₿C"
                    label="Top Bitchager"
                    cor="var(--cor-destaque-texto)"
                />
                <BotaoCategoria
                    ativo={categoria === 'pontos'}
                    onClick={() => setCategoria('pontos')}
                    icone="⭐"
                    label="Top Pontos"
                    cor="var(--cor-destaque)"
                />
            </div>

            {/* ---- Pódio: top 3 ---- */}
            <Podio
                top3={dadosOrdenados.slice(0, 3)}
                categoria={categoria}
                meuUid={meuUid}
            />

            {/* ---- Lista: posições 4 a 10 ---- */}
            <div style={estilos.lista}>
                {dadosOrdenados.slice(3).map(jogador => (
                    <LinhaRanking
                        key={jogador.uid}
                        jogador={jogador}
                        categoria={categoria}
                        euSou={jogador.uid === meuUid}
                    />
                ))}
            </div>

            {/* ---- Minha posição (se não estiver no top 10) ---- */}
            {meuUid && minhaposicao > 9 && (
                <div style={estilos.minhaPosicaoContainer}>
                    <div style={estilos.separadorMinhaPosicao}>
                        <div style={estilos.linhaSeparador} />
                        <span style={estilos.textSeparador}>sua posição</span>
                        <div style={estilos.linhaSeparador} />
                    </div>
                    <LinhaRanking
                        jogador={dadosOrdenados[minhaposicao]}
                        categoria={categoria}
                        euSou={true}
                    />
                </div>
            )}

            {/* ---- Aviso de dados de exemplo ---- */}
            {ranking.length === 0 && (
                <p style={estilos.avisoExemplo}>
                    Dados de exemplo — ranking real carrega em breve
                </p>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE Podio
// Exibe os 3 primeiros em destaque visual
// O 1º lugar fica no centro e mais alto
// ================================================================

function Podio({ top3, categoria, meuUid }) {
    if (top3.length < 3) return null;

    // Reordena para exibição: 2º, 1º, 3º (visual de pódio)
    const ordem = [top3[1], top3[0], top3[2]];
    const alturas = [80, 100, 70]; // altura do bloco do pódio em px

    return (
        <div style={estilos.podio}>
            {ordem.map((jogador, i) => {
                const med     = medalha(jogador.posicao);
                const euSou   = jogador.uid === meuUid;
                const valor   = categoria === 'saldo'
                    ? `₿C ${fmtCompacto(jogador.saldo)}`
                    : `${fmtCompacto(jogador.rankPontos)} pts`;

                return (
                    <div key={jogador.uid} style={estilos.podioItem}>

                        {/* Avatar */}
                        <div style={{
                            ...estilos.podioAvatar,
                            border: euSou
                                ? '2px solid var(--cor-destaque)'
                                : `2px solid ${med.cor}`,
                            boxShadow: euSou
                                ? '0 0 12px var(--cor-destaque-linha)'
                                : 'none',
                        }}>
                            {jogador.avatar
                                ? <img src={jogador.avatar} alt={jogador.nome} style={estilos.podioAvatarImg} onError={e => e.target.style.display='none'} />
                                : <span style={{ fontSize: '20px' }}>🧑</span>
                            }
                        </div>

                        {/* Emoji medalha */}
                        <span style={estilos.podioMedalha}>{med.emoji}</span>

                        {/* Nome */}
                        <p style={{
                            ...estilos.podioNome,
                            color: euSou ? 'var(--cor-destaque-texto)' : 'var(--cor-texto)',
                        }}>
                            {jogador.nome.split(' ')[0]}
                        </p>

                        {/* Valor */}
                        <p style={{ ...estilos.podioValor, color: med.cor }}>
                            {valor}
                        </p>

                        {/* Bloco do pódio */}
                        <div style={{
                            ...estilos.podioBloco,
                            height:     alturas[i] + 'px',
                            background: i === 1
                                ? `linear-gradient(to bottom, ${med.cor}30, ${med.cor}10)`
                                : `var(--cor-superficie)`,
                            borderTop: `2px solid color-mix(in srgb, ${med.cor} 31%, transparent)`,
                        }}>
                            <span style={{ fontSize: '20px', fontWeight: '700', color: med.cor }}>
                                {jogador.posicao}
                            </span>
                        </div>

                    </div>
                );
            })}
        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE LinhaRanking
// Uma linha da lista (posições 4 a 10)
// ================================================================

function LinhaRanking({ jogador, categoria, euSou }) {
    const med   = medalha(jogador.posicao);
    const valor = categoria === 'saldo'
        ? `₿C ${fmtCompacto(jogador.saldo)}`
        : `${fmtCompacto(jogador.rankPontos)} pts`;

    return (
        <div style={{
            ...estilos.linha,
            background: euSou
                ? 'var(--cor-destaque-suave)'
                : 'var(--cor-hover-linha)',
            border: euSou
                ? '1px solid var(--cor-destaque-linha)'
                : '1px solid var(--cor-superficie)',
        }}>

            {/* Posição */}
            <span style={{
                ...estilos.linhaPosicao,
                color: med.cor,
                fontWeight: jogador.posicao <= 3 ? '700' : '500',
            }}>
                {med.emoji || `#${jogador.posicao}`}
            </span>

            {/* Avatar pequeno */}
            <div style={estilos.linhaAvatar}>
                {jogador.avatar
                    ? <img src={jogador.avatar} alt={jogador.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                    : <span style={{ fontSize: '14px' }}>🧑</span>
                }
            </div>

            {/* Nome */}
            <span style={{
                ...estilos.linhaNome,
                color: euSou ? 'var(--cor-destaque-texto)' : 'var(--cor-texto)',
                fontWeight: euSou ? '600' : '400',
                flex: 1,
            }}>
                {jogador.nome}
                {euSou && <span style={estilos.euBadge}> você</span>}
            </span>

            {/* Valor */}
            <span style={estilos.linhaValor}>{valor}</span>

        </div>
    );
}


// ================================================================
// BLOCO 5: COMPONENTE BotaoCategoria
// ================================================================

function BotaoCategoria({ ativo, onClick, icone, label, cor }) {
    return (
        <button
            onClick={onClick}
            style={{
                ...estilos.btnCategoria,
                background: ativo ? `color-mix(in srgb, ${cor} 8%, transparent)` : 'transparent',
                border:     ativo
                    ? `1px solid color-mix(in srgb, ${cor} 25%, transparent)`
                    : '1px solid var(--cor-superficie)',
                color: ativo ? cor : 'var(--cor-texto-3)',
            }}
        >
            <span style={{
                fontSize:   typeof icone === 'string' && icone === '₿C' ? '11px' : '14px',
                fontWeight: '700',
            }}>
                {icone}
            </span>
            <span style={{ fontSize: '12px', fontWeight: ativo ? '600' : '400' }}>
                {label}
            </span>
        </button>
    );
}


// ================================================================
// BLOCO 6: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    // Seletor de categoria
    seletorCategoria: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
    },

    btnCategoria: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '6px',
        padding:        '9px 12px',
        borderRadius:   '8px',
        cursor:         'pointer',
        transition:     'all 0.2s',
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
    },

    // Pódio dos 3 primeiros
    podio: {
        display:        'flex',
        alignItems:     'flex-end',
        justifyContent: 'center',
        gap:            '8px',
        padding:        '8px 0 0',
    },

    podioItem: {
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '4px',
    },

    podioAvatar: {
        width:          '48px',
        height:         '48px',
        borderRadius:   '50%',
        overflow:       'hidden',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'var(--cor-superficie)',
    },

    podioAvatarImg: {
        width:      '100%',
        height:     '100%',
        objectFit:  'cover',
    },

    podioMedalha: {
        fontSize:   '18px',
        lineHeight: 1,
        marginTop:  '-4px',
    },

    podioNome: {
        fontSize:     '11px',
        fontWeight:   '500',
        margin:       0,
        textAlign:    'center',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        width:        '100%',
    },

    podioValor: {
        fontSize:   '11px',
        fontWeight: '700',
        margin:     0,
        textAlign:  'center',
    },

    podioBloco: {
        width:          '100%',
        borderRadius:   '6px 6px 0 0',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        marginTop:      '4px',
    },

    // Lista de posições 4-10
    lista: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    linha: {
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        padding:      '10px 12px',
        borderRadius: '8px',
        transition:   'background 0.2s',
    },

    linhaPosicao: {
        fontSize:   '13px',
        minWidth:   '28px',
        textAlign:  'center',
    },

    linhaAvatar: {
        width:          '30px',
        height:         '30px',
        borderRadius:   '50%',
        overflow:       'hidden',
        flexShrink:     0,
        background:     'var(--cor-superficie)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    linhaNome: {
        fontSize:     '13px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
    },

    linhaValor: {
        fontSize:   '12px',
        fontWeight: '600',
        color:      'var(--cor-destaque-texto)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
    },

    // Badge "você" ao lado do nome
    euBadge: {
        fontSize:     '10px',
        background:   'var(--cor-destaque-suave)',
        color:        'var(--cor-destaque-texto)',
        padding:      '1px 5px',
        borderRadius: '4px',
        marginLeft:   '4px',
        fontWeight:   '500',
    },

    // Seção "minha posição" quando fora do top 10
    minhaPosicaoContainer: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        marginTop:     '4px',
    },

    separadorMinhaPosicao: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    linhaSeparador: {
        flex:       1,
        height:     '1px',
        background: 'var(--cor-superficie)',
    },

    textSeparador: {
        fontSize:  '10px',
        color:     'var(--cor-texto-3)',
        flexShrink: 0,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    // Aviso de dados de exemplo
    avisoExemplo: {
        fontSize:  '11px',
        color:     'var(--cor-linha-forte)',
        textAlign: 'center',
        margin:    '4px 0 0',
        fontStyle: 'italic',
    },
};
