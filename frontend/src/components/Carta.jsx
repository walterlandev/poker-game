/* ================================================================
   ARQUIVO: frontend/src/components/Carta.jsx

   Carta de baralho (face e verso) usada na mesa, nos assentos e na
   sua mão. Só apresentação.

   TEMAS DE BARALHO (core/temas.js):
   O tema é sempre o do DONO das cartas (jogador.tema), então o baralho
   comprado na loja aparece para os outros jogadores também. O tema
   "clássico" usa as cores do tema visual do app (variáveis CSS); os
   temas comprados usam as cores definidas no catálogo.
================================================================ */

import { getTema } from '../core/temas';
import { ehColecao, svgFace, svgVerso } from '../core/colecoes';

function coresDoTema(temaId, naipe) {
    const t = getTema(temaId);
    if (t.id === 'classico') {
        const vermelho = naipe === '♥' || naipe === '♦';
        return {
            t,
            cor:   vermelho ? 'var(--cor-naipe-verm)' : 'var(--cor-naipe-preto)',
            fundo: 'var(--cor-carta-face)',
            borda: 'var(--cor-carta-borda)',
        };
    }
    return {
        t,
        cor:   t.naipes[naipe]?.cor || 'var(--cor-naipe-preto)',
        fundo: t.frente.fundo || 'var(--cor-carta-face)',
        borda: t.frente.borda || 'var(--cor-carta-borda)',
    };
}

/**
 * Face da carta.
 *  largura → px; altura = largura × 1,4
 *  indice  → mostra o naipe pequeno sob o valor (útil quando as cartas
 *            se sobrepõem e o naipe grande do canto fica coberto)
 */
export function CartaFace({ carta, largura = 46, tema = 'classico', indice = false, className = '' }) {
    if (!carta) return null;
    if (ehColecao(tema)) {
        // Coleção em SVG: a carta inteira (valor, naipe, emblema) vem do desenho.
        return (
            <div
                className={`carta carta-colecao ${className}`}
                role="img"
                aria-label={`${carta.display || carta.valor} de ${NOME_NAIPE[carta.naipe] || carta.naipe}`}
                style={{ width: largura + 'px', height: Math.round(largura * 1.4) + 'px' }}
            >
                <svg viewBox="0 0 250 350" width="100%" height="100%" aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: svgFace(tema, carta.valor, carta.naipe) }} />
            </div>
        );
    }
    const { t, cor, fundo, borda } = coresDoTema(tema, carta.naipe);
    const premium = !!t.premium;
    const altura  = Math.round(largura * 1.4);
    return (
        <div
            className={`carta ${className}`}
            role="img"
            aria-label={`${carta.display || carta.valor} de ${NOME_NAIPE[carta.naipe] || carta.naipe}`}
            style={{
                width:  largura + 'px',
                height: altura + 'px',
                background: fundo,
                borderColor: borda,
                borderWidth: premium ? '2px' : '1px',
                boxShadow: premium
                    ? `var(--sombra-carta), inset 0 0 0 2px ${fundo}, inset 0 0 0 3px ${borda}`
                    : undefined,
                color: cor,
            }}
        >
            <span className="valor" style={{ fontSize: Math.round(largura * 0.34) + 'px' }}>
                {carta.display || carta.valor}
                {indice && <small>{carta.naipe}</small>}
            </span>
            <span className="naipe" style={{ fontSize: Math.round(largura * 0.56) + 'px' }}>
                {carta.naipe}
            </span>
            {premium && (
                <span className="carta-premium-canto" style={{ top: '2px', right: '3px', fontSize: Math.max(7, Math.round(largura * 0.16)) + 'px', color: borda }}>✦</span>
            )}
        </div>
    );
}

const NOME_NAIPE = { '♥': 'copas', '♦': 'ouros', '♠': 'espadas', '♣': 'paus' };

/** Verso da carta (carta fechada de outro jogador). */
export function CartaVerso({ largura = 18, tema = 'classico' }) {
    if (ehColecao(tema)) {
        return (
            <div className="carta-verso carta-colecao" aria-hidden="true"
                style={{ width: largura + 'px', height: Math.round(largura * 1.4) + 'px' }}>
                <svg viewBox="0 0 250 350" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
                    dangerouslySetInnerHTML={{ __html: svgVerso(tema) }} />
            </div>
        );
    }
    const t = getTema(tema);
    const classico = t.id === 'classico';
    const fundo   = classico ? 'var(--cor-feltro)'       : (t.verso.fundo || 'var(--cor-feltro)');
    const detalhe = classico ? 'var(--cor-feltro-fundo)' : (t.verso.detalhe || fundo);
    return (
        <div
            className="carta-verso"
            aria-hidden="true"
            style={{
                width:  largura + 'px',
                height: Math.round(largura * 1.4) + 'px',
                background: `repeating-linear-gradient(45deg, ${fundo} 0 3px, ${detalhe} 3px 6px)`,
                borderColor: classico ? 'var(--cor-verso-borda)' : undefined,
            }}
        />
    );
}

export function CartaVazia({ largura = 46 }) {
    return (
        <div
            className="carta-vazia"
            aria-hidden="true"
            style={{ width: largura + 'px', height: Math.round(largura * 1.4) + 'px' }}
        />
    );
}
