/* ================================================================
   ARQUIVO: frontend/src/pages/Game/InfoMesa.jsx

   CONCEITO GERAL:
   Painel de informações da mesa exibido no topo da tela do jogo.
   Mostra ao jogador os dados essenciais da partida em andamento:
     → Nome da mesa
     → Fase atual (Pré-Flop, Flop, Turn, River, Showdown)
     → Pote total acumulado
     → Blinds (Small Blind e Big Blind)
     → Maior aposta atual da rodada

   POR QUE ESSAS INFORMAÇÕES SÃO IMPORTANTES:
     Pote       → quanto o jogador pode ganhar se vencer
     Fase       → em qual momento da mão estamos
     Big Blind  → referência para calcular apostas (ex: "abrir 3x o BB")
     Maior Aposta → quanto precisa pagar para continuar (call)

   DESIGN:
   Compacto e horizontal para não ocupar muito espaço na tela mobile.
   As informações mais importantes (pote e fase) ficam em destaque.
   Blinds ficam em tamanho menor pois mudam menos durante a mão.

   PROPS:
     mesa → objeto completo do estado da mesa
            { nome, fase, pote, smallBlind, bigBlind, maiorAposta }
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

// Mapeamento de fase para label amigável e cor
const NOME_FASE = {
    'AGUARDANDO': 'Aguardando',
    'PRE-FLOP':   'Pré-flop',
    'FLOP':       'Flop',
    'TURN':       'Turn',
    'RIVER':      'River',
    'SHOWDOWN':   'Showdown',
};

function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}

export default function InfoMesa({ mesa }) {
    if (!mesa) return null;

    const fase      = NOME_FASE[mesa.fase] || NOME_FASE.AGUARDANDO;
    const temAposta = (mesa.maiorAposta || 0) > 0;
    const qtd       = Object.keys(mesa.jogadores || {}).length;

    return (
        <div className="info-mesa">
            <div className="bloco">
                <span className="nome">{mesa.nome || 'Mesa'}</span>
                <span className="sub">
                    Blinds <span className="num">{fmt(mesa.smallBlind)}/{fmt(mesa.bigBlind)}</span>, {fase}
                </span>
            </div>
            <div className="extra">
                <span>{qtd} {qtd === 1 ? 'jogador' : 'jogadores'}</span>
                <span>Pote <b className="num cor-bc">₿C {fmt(mesa.pote)}</b></span>
                {temAposta && <span>Maior aposta <b className="num">₿C {fmt(mesa.maiorAposta)}</b></span>}
            </div>
        </div>
    );
}
