/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Mesa.jsx

   Desenha a mesa (trilho de couro + feltro), o centro (fase, pote,
   cartas comunitárias), os assentos e as fichas de aposta.

   DOIS FORMATOS (decidido pelo CSS de .mesa-oval, medido aqui):
     → paisagem (desktop/tablet): oval deitada, lugares distribuídos
       igualmente na borda, você embaixo.
     → retrato (celular ≤ 600px): mesa em pé. Os adversários ocupam
       posições fixas pensadas para até 9 lugares sem cobrir o centro;
       você fica embaixo e suas cartas aparecem grandes fora da mesa
       (Game/index.jsx).
   Só apresentação: nenhuma regra de jogo é decidida aqui.
================================================================ */

import { useRef, useEffect, useState } from 'react';
import Jogador from './Jogador';
import { parsearCarta } from '../../core/temas';
import { CartaFace, CartaVazia } from '../../components/Carta';
import ChipPoker, { PilhaFichas } from '../../components/ChipPoker';
import { corPorValor } from '../../core/chipCores';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function tempoDoJogador(uid) {
    return uid?.startsWith('bot_') ? 10000 : 45000;
}

const NOME_FASE = {
    'PRE-FLOP': 'Pré-flop',
    'FLOP':     'Flop',
    'TURN':     'Turn',
    'RIVER':    'River',
    'SHOWDOWN': 'Showdown',
};

// ── Retrato: posições (x%, y% da oval) no sentido horário a partir de você ──
const P = {
    baixoEsq:  [16, 88], ladoEsqB: [3, 66], ladoEsqA: [3, 26], topoEsq: [27, 3],
    topo:      [50, 1],  topoDir:  [73, 3], ladoDirA: [97, 26], ladoDirB: [97, 66],
    baixoDir:  [84, 88],
};
const LAYOUT_RETRATO = {
    1: [P.topo],
    2: [P.topoEsq, P.topoDir],
    3: [P.ladoEsqA, P.topo, P.ladoDirA],
    4: [P.ladoEsqB, P.ladoEsqA, P.ladoDirA, P.ladoDirB],
    5: [P.ladoEsqB, P.ladoEsqA, P.topo, P.ladoDirA, P.ladoDirB],
    6: [P.ladoEsqB, P.ladoEsqA, P.topoEsq, P.topoDir, P.ladoDirA, P.ladoDirB],
    7: [P.baixoEsq, P.ladoEsqB, P.ladoEsqA, P.topo, P.ladoDirA, P.ladoDirB, P.baixoDir],
    8: [P.baixoEsq, P.ladoEsqB, P.ladoEsqA, P.topoEsq, P.topoDir, P.ladoDirA, P.ladoDirB, P.baixoDir],
};
const POS_EU_RETRATO = [50, 97];

export default function Mesa({ mesa, meuUid, minhasCartas = [], meuAvatar = '', tema = 'classico' }) {
    const ovalRef = useRef(null);
    const [dims, setDims] = useState({ w: 400, h: 242 });

    // Mede a oval em pixels reais — atualiza quando a janela redimensiona
    useEffect(() => {
        const el = ovalRef.current;
        if (!el) return;
        const obs = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width <= 0) return;
            setDims(prev => (
                Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
                    ? prev
                    : { w: width, h: height }
            ));
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    if (!mesa) return null;

    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const cartasCom      = (mesa.cartasComunitarias || []).map(parsearCarta);
    const total          = jogadoresArray.length;
    const meuIndex       = jogadoresArray.findIndex(([uid]) => uid === meuUid);
    const offset         = meuIndex >= 0 ? meuIndex : 0;
    const retrato        = dims.h > dims.w;
    const euSentado      = meuIndex >= 0;
    const treino         = mesa?.treino === true;   // fichas sem valor: sem ₿C
    const moeda          = (n) => (treino ? fmt(n) : `₿C ${fmt(n)}`);

    // ── Posições dos assentos em % da oval ──────────────────────────
    const posicoes = jogadoresArray.map(([uid, jogador], index) => {
        const indiceRel = (index - offset + total) % total;
        let esquerda, topo;

        if (retrato) {
            // Quem assiste sem estar sentado: todos entram nas posições fixas
            const nAdv   = euSentado ? total - 1 : total;
            const slots  = LAYOUT_RETRATO[Math.min(8, Math.max(1, nAdv))] || LAYOUT_RETRATO[8];
            if (euSentado && indiceRel === 0) {
                [esquerda, topo] = POS_EU_RETRATO;
            } else {
                const k = euSentado ? indiceRel - 1 : indiceRel;
                [esquerda, topo] = slots[k] || POS_EU_RETRATO;
            }
        } else {
            // +90° → indiceRel=0 (jogador local) fica na BASE
            const angulo = (indiceRel / total) * 360 + 90;
            const rad    = (angulo * Math.PI) / 180;
            esquerda = 50 + Math.cos(rad) * 50 * 0.92;
            topo     = 50 + Math.sin(rad) * 50 * 0.92;
        }
        return { uid, jogador, esquerda, topo, souEu: uid === meuUid };
    });

    // ── Escalas ─────────────────────────────────────────────────────
    const avatarSz = retrato
        ? (total >= 7 ? 40 : 44)
        : Math.max(44, Math.min(64, Math.round(dims.w * 0.072)));
    const cardW = retrato
        ? Math.max(34, Math.min(46, Math.floor((dims.w - 40) / 5.6)))
        : Math.max(40, Math.min(64, Math.round(dims.w * 0.074)));
    const potFont = retrato ? 19 : (dims.w > 700 ? 23 : 19);

    // Aposta da rodada: entre o assento e o centro
    const fracaoAposta = retrato ? 0.36 : 0.4;

    return (
        <div className="mesa-container">
            <div ref={ovalRef} className="mesa-oval">
                <div className="mesa-trilho">
                    <div className="mesa-feltro" />
                </div>

                {/* Centro: fase + pote + cartas */}
                <div className="mesa-centro">
                    {mesa.fase && mesa.fase !== 'AGUARDANDO' && (
                        <span className="mesa-fase">{NOME_FASE[mesa.fase] || mesa.fase}</span>
                    )}

                    {mesa.pote > 0 && (
                        <div className="mesa-pote" aria-label={`Pote ${moeda(mesa.pote)}`}>
                            <PilhaFichas size={Math.round(potFont * 0.9)} valor={mesa.pote} />
                            <span className="num" style={{ fontSize: potFont + 'px' }}>{moeda(mesa.pote)}</span>
                        </div>
                    )}

                    <div className="mesa-comunitarias">
                        {mesa.fase === 'AGUARDANDO' ? (
                            <p className="mesa-vazio">Aguardando jogadores…</p>
                        ) : cartasCom.length > 0 ? (
                            Array.from({ length: 5 }).map((_, i) => {
                                const carta = cartasCom[i];
                                // Comunitárias usam o seu baralho (quem está olhando)
                                return carta
                                    ? <CartaFace key={i} carta={carta} largura={cardW} tema={tema} className="carta-revelada" />
                                    : <CartaVazia key={i} largura={cardW} />;
                            })
                        ) : (
                            <p className="mesa-vazio">Distribuindo…</p>
                        )}
                    </div>
                </div>

                {/* Assentos */}
                {posicoes.map(({ uid, jogador, esquerda, topo, souEu }) => (
                    <div key={uid} className="mesa-assento" style={{ left: `${esquerda}%`, top: `${topo}%` }}>
                        <Jogador
                            jogador={souEu && meuAvatar ? { ...jogador, avatar: meuAvatar } : jogador}
                            souEu={souEu}
                            ehVez={mesa.turno === uid}
                            cartasPrivadas={souEu ? minhasCartas : []}
                            ehDealer={mesa.dealer === uid}
                            ehSB={mesa.sbId === uid}
                            ehBB={mesa.bbId === uid}
                            tempoMs={tempoDoJogador(uid)}
                            expiraEm={mesa.turno === uid ? mesa.turnoExpiraEm : null}
                            avatarSz={avatarSz}
                            tema={tema}
                            ocultarCartas={souEu && retrato}
                            treino={treino}
                        />
                    </div>
                ))}

                {/* Fichas de aposta da rodada */}
                {posicoes.map(({ uid, jogador, esquerda, topo }) => {
                    const foldado = jogador.status === 'fold' || jogador.status === 'FOLD';
                    const aposta  = jogador.apostaRodada || jogador.aposta || 0;
                    if (aposta <= 0 || foldado) return null;
                    const x = esquerda + (50 - esquerda) * fracaoAposta;
                    const y = topo     + (50 - topo)     * fracaoAposta;
                    return (
                        <div key={`aposta-${uid}`} className="mesa-aposta" style={{ left: `${x}%`, top: `${y}%` }}>
                            <ChipPoker size={16} {...corPorValor(aposta)} />
                            <span className="num">{fmt(aposta)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
