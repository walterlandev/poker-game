/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ListaMesas.jsx

   Lista de mesas do lobby. Uma linha por mesa, com os blinds em
   destaque (é o que o jogador procura primeiro), nome, buy-in, lugares
   ocupados (pontos), estado e o botão Entrar.

   PROPS:
     mesas      → array de mesas vindas de GET /mesas
     carregando → boolean
     privadas   → boolean: true = filtro privadas, false = públicas
     onEntrar   → function(mesaId): chamada ao clicar em entrar
================================================================ */

import Icone from '../../components/Icone';

const MAX_LUGARES = 9;

function infoFase(fase) {
    if (fase === 'AGUARDANDO') return { texto: 'Aguardando', classe: '' };
    if (fase === 'SHOWDOWN')   return { texto: 'Showdown',   classe: 'jogo' };
    if (['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'].includes(fase)) return { texto: 'Em jogo', classe: 'jogo' };
    return { texto: fase || 'Desconhecido', classe: '' };
}

function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}

export default function ListaMesas({ mesas = [], carregando, privadas, onEntrar, ocupado = false }) {

    if (carregando) {
        return (
            <div className="lista-mesas" aria-busy="true" aria-label="Buscando mesas…">
                {[0, 1, 2].map(i => <div key={i} className="linha-mesa esqueleto" />)}
            </div>
        );
    }

    if (mesas.length === 0) {
        return (
            <div className="lista-vazia">
                <Icone nome={privadas ? 'cadeado' : 'mesas'} tamanho={32} />
                <p className="titulo">
                    {privadas ? 'Nenhuma mesa privada disponível' : 'Nenhuma mesa pública aberta agora'}
                </p>
                <p className="sub">
                    {privadas
                        ? 'Peça um convite a um amigo ou crie sua mesa.'
                        : 'Crie uma mesa e chame os amigos.'}
                </p>
            </div>
        );
    }

    return (
        <div className="lista-mesas">
            <div className="lista-mesas-cab" aria-hidden="true">
                <span>Blinds</span><span>Mesa</span><span>Buy-in</span><span>Lugares</span><span>Estado</span><span />
            </div>
            {mesas.map(mesa => (
                <LinhaMesa key={mesa.id} mesa={mesa} privada={privadas} onEntrar={onEntrar} ocupado={ocupado} />
            ))}
            <p className="lista-mesas-total">
                {mesas.length} {mesas.length === 1 ? 'mesa disponível' : 'mesas disponíveis'}
            </p>
        </div>
    );
}

function LinhaMesa({ mesa, privada, onEntrar, ocupado }) {
    const fase = infoFase(mesa.fase);
    // GET /mesas manda `jogadores` como CONTAGEM (número), não como objeto
    // — Object.keys(numero) sempre retorna [] (length 0), então o card
    // sempre mostrava "0/9" e mesas cheias nunca apareciam como cheias
    // pros outros jogadores no lobby.
    const qtdJogadores = typeof mesa.jogadores === 'number'
        ? mesa.jogadores
        : Object.keys(mesa.jogadores || {}).length;
    const estaCheia = qtdJogadores >= MAX_LUGARES;
    const nome      = mesa.nome || `Mesa ${mesa.id}`;
    // Mesa com bots = mesa de treino (fichas sem valor). Lido com segurança
    // para funcionar antes e depois do servidor mandar o campo.
    const treino    = mesa?.treino === true;

    return (
        <div className="linha-mesa">
            <div className="blinds">
                <span className="num">{fmt(mesa.smallBlind)}/{fmt(mesa.bigBlind)}</span>
                <span className="rot">blinds</span>
            </div>

            <div className="meio">
                <div className="nome">
                    {privada && <Icone nome="cadeado" tamanho={14} titulo="Mesa privada" />}
                    <span>{nome}</span>
                    {treino && <span className="etiqueta-treino">Treino</span>}
                </div>
                <div className="meta">
                    <span className="buyin">
                        {treino
                            ? <>Buy-in <b className="num">Grátis</b></>
                            : <>Buy-in <b className="num cor-bc">₿C {fmt(mesa.buyIn || mesa.valorBuyIn)}</b></>}
                    </span>
                    <span className="lugares" aria-label={`${qtdJogadores} de ${MAX_LUGARES} lugares ocupados`}>
                        {Array.from({ length: MAX_LUGARES }).map((_, i) => (
                            <i key={i} className={i < qtdJogadores ? '' : 'livre'} />
                        ))}
                        <em className="num">{qtdJogadores}/{MAX_LUGARES}</em>
                    </span>
                    <span className={`estado-mesa desk ${estaCheia ? '' : fase.classe}`}>{estaCheia ? 'Cheia' : fase.texto}</span>
                </div>
            </div>

            <div className="acao">
                <span className={`estado-mesa mob ${estaCheia ? '' : fase.classe}`}>{estaCheia ? 'Cheia' : fase.texto}</span>
                <button
                    type="button"
                    className="btn btn-neutro"
                    onClick={() => onEntrar(mesa.id)}
                    disabled={estaCheia || ocupado}
                    aria-busy={ocupado || undefined}
                    aria-label={estaCheia ? `${nome}: mesa cheia` : `Entrar na mesa ${nome}`}
                >
                    {estaCheia ? 'Cheia' : 'Entrar'}
                </button>
            </div>
        </div>
    );
}
