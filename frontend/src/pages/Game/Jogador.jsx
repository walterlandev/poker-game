/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Jogador.jsx

   Assento de um jogador na mesa: avatar (com anel do temporizador),
   plaquinha com primeiro nome e fichas, etiquetas Fold/All-in, botão
   do dealer e SB/BB, e as cartas do jogador.

   A ficha de aposta da rodada NÃO fica aqui: o Mesa.jsx desenha entre o
   assento e o centro da mesa, para não cobrir avatar e cartas.

   Cartas:
     → fechadas (outros jogadores): versos pequenos ao lado do avatar
     → abertas de outro jogador (showdown): em leque sobre o avatar
     → as suas: ao lado do avatar (no celular em retrato ficam
       escondidas aqui e aparecem grandes embaixo da mesa — ocultarCartas)
   O baralho exibido é o do DONO das cartas (jogador.tema), então o tema
   comprado na loja aparece para os adversários também.
================================================================ */

import Temporizador from './Temporizador';
import { parsearCarta } from '../../core/temas';
import { CartaFace, CartaVerso } from '../../components/Carta';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function iniciais(nome = '') {
    const partes = String(nome).trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

export default function Jogador({
    jogador,
    souEu          = false,
    ehVez          = false,
    cartasPrivadas = [],
    ehDealer       = false,
    ehSB           = false,
    ehBB           = false,
    tempoMs        = 45000,
    expiraEm       = null,   // prazo absoluto do servidor (mesa.turnoExpiraEm)
    avatarSz       = 48,     // escala responsiva vinda do Mesa.jsx
    tema           = 'classico',
    ocultarCartas  = false,  // celular em retrato: suas cartas aparecem embaixo da mesa
    treino         = false,  // mesa de treino: fichas sem o símbolo ₿C
}) {
    if (!jogador) return null;

    const foldado = jogador.status === 'fold' || jogador.status === 'FOLD';
    const allIn   = jogador.status === 'all-in' || jogador.status === 'ALL-IN';

    const cartas = souEu && cartasPrivadas.length > 0
        ? cartasPrivadas
        : (jogador.cartas || []);

    // Baralho comprado é do DONO das cartas, não de quem está olhando.
    const temaCartas = jogador.tema || tema;

    const parseadas  = cartas.map(parsearCarta);
    const temAbertas = parseadas.some(Boolean);
    const fonte      = avatarSz >= 56 ? 14 : 12;
    const nome       = souEu ? 'Você' : (jogador.nome?.split(' ')[0] || 'Jogador');

    const classes = ['assento'];
    if (ehVez)   classes.push('turno');
    if (foldado) classes.push('desistiu');
    if (souEu)   classes.push('eu');

    const larguraVerso  = Math.max(14, Math.round(avatarSz * 0.36));
    const larguraAberta = Math.max(26, Math.round(avatarSz * 0.62));
    const larguraMinha  = Math.max(34, Math.round(avatarSz * 0.92));

    return (
        <div className={classes.join(' ')} style={{ fontSize: fonte + 'px' }}>

            <div className="assento-avatar" style={{ width: avatarSz + 'px', height: avatarSz + 'px' }}>
                <div className="assento-rosto" style={{ fontSize: Math.round(avatarSz * 0.34) + 'px' }}>
                    {jogador.avatar ? (
                        <img
                            src={jogador.avatar}
                            alt=""
                            width={avatarSz}
                            height={avatarSz}
                            onError={e => { e.target.onerror = null; e.target.style.display = 'none'; }}
                        />
                    ) : (
                        <span aria-hidden="true">{iniciais(jogador.nome)}</span>
                    )}
                </div>

                <Temporizador totalMs={tempoMs} expiraEm={expiraEm} ativo={ehVez} tamanho={avatarSz} />

                {/* Cartas fechadas de outro jogador: versos ao lado do avatar */}
                {!souEu && cartas.length > 0 && !temAbertas && !foldado && (
                    <div className="assento-cartas versos" style={{ right: -Math.round(larguraVerso * 0.9) + 'px' }}>
                        {parseadas.map((_, i) => <CartaVerso key={i} largura={larguraVerso} tema={temaCartas} />)}
                    </div>
                )}

                {/* Cartas abertas de outro jogador (showdown): leque sobre o avatar */}
                {!souEu && temAbertas && (
                    <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translateX(-50%)', display: 'flex', gap: '2px', zIndex: 4 }}>
                        {parseadas.map((c, i) => c
                            ? <CartaFace key={i} carta={c} largura={larguraAberta} tema={temaCartas} indice />
                            : <CartaVerso key={i} largura={larguraAberta} tema={temaCartas} />)}
                    </div>
                )}

                {/* Suas cartas (desktop / paisagem): ao lado esquerdo do avatar */}
                {souEu && !ocultarCartas && cartas.length > 0 && (
                    <div style={{
                        position: 'absolute', top: '50%', right: '100%', marginRight: '10px',
                        transform: 'translateY(-50%)', display: 'flex', alignItems: 'flex-end', zIndex: 4,
                    }}>
                        {parseadas.map((c, i) => (
                            <div key={i} style={{
                                marginLeft: i > 0 ? -Math.round(larguraMinha * 0.25) + 'px' : 0,
                                transform: `rotate(${i === 0 ? -6 : 5}deg)`,
                            }}>
                                {c
                                    ? <CartaFace carta={c} largura={larguraMinha} tema={temaCartas} indice />
                                    : <CartaVerso largura={larguraMinha} tema={temaCartas} />}
                            </div>
                        ))}
                    </div>
                )}

                {allIn   && <span className="assento-etq allin">All-in</span>}
                {foldado && <span className="assento-etq">Fold</span>}

                {(ehDealer || ehSB || ehBB) && (
                    <div className="assento-posicoes">
                        {ehDealer && <span className="assento-dealer" title="Dealer">D</span>}
                        {ehSB     && <span className="assento-blind" title="Small blind">SB</span>}
                        {ehBB     && <span className="assento-blind" title="Big blind">BB</span>}
                    </div>
                )}
            </div>

            <div className="assento-placa" style={{ maxWidth: Math.round(avatarSz * 1.9) + 'px' }}>
                <span className="nm">{nome}</span>
                <span className="stk num">{treino ? fmt(jogador.saldo) : `₿C ${fmt(jogador.saldo)}`}</span>
            </div>
        </div>
    );
}
