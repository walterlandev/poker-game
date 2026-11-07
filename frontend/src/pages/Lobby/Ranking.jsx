/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Ranking.jsx

   Ranking dos melhores jogadores. Duas categorias:
     → Top Bitchager : quem tem mais ₿C acumulado
     → Top Pontos    : quem tem mais pontos de rank (vitórias)

   O jogador atual aparece destacado na lista e, se estiver fora do
   top 10, numa linha separada no fim.

   PROPS:
     ranking → array ordenado pelo servidor
               [ { uid, nome, avatar, fichasLiquidas, vitorias, posicao } ]
               (saldo/rankPontos também aceitos, usados nos dados de exemplo)
     meuUid  → uid do jogador logado (para destacar)

   Estilos em styles/ranking-admin.css (prefixo rk-).
================================================================ */

import { useState } from 'react';
import Icone from '../../components/Icone';
import '../../styles/ranking-admin.css';

// Formata número grande de forma compacta
// Ex: 12500 → "12,5K", 1200000 → "1,2M"
function fmtCompacto(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return String(n);
}

function fmtValor(jogador, categoria) {
    return categoria === 'saldo'
        ? `₿C ${fmtCompacto(jogador.saldo)}`
        : `${fmtCompacto(jogador.rankPontos)} pts`;
}

// Dados de exemplo enquanto o backend não envia o ranking real
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

export default function Ranking({ ranking = [], meuUid }) {

    const [categoria, setCategoria] = useState('saldo');

    // O servidor (GET /ranking → buscarRanking) manda `fichasLiquidas` e
    // `vitorias`; os dados de exemplo usam `saldo` e `rankPontos`. Normaliza
    // para os nomes que o componente usa, com fallback para 0 (nunca undefined).
    const dados = (ranking.length > 0 ? ranking : RANKING_EXEMPLO).map(j => ({
        ...j,
        saldo:      j.fichasLiquidas ?? j.saldo ?? 0,
        rankPontos: j.vitorias       ?? j.rankPontos ?? 0,
    }));

    const dadosOrdenados = [...dados].sort((a, b) =>
        categoria === 'saldo'
            ? b.saldo - a.saldo
            : b.rankPontos - a.rankPontos
    ).map((j, i) => ({ ...j, posicao: i + 1 }));

    const minhaposicao = dadosOrdenados.findIndex(j => j.uid === meuUid);

    // Com menos de 3 jogadores não há pódio: todos vão para a lista
    const temPodio = dadosOrdenados.length >= 3;
    const top3  = temPodio ? dadosOrdenados.slice(0, 3) : [];
    const resto = temPodio ? dadosOrdenados.slice(3) : dadosOrdenados;

    return (
        <div className="rk">

            <div className="rk-abas" role="group" aria-label="Categoria do ranking">
                <button type="button" className="rk-aba" aria-pressed={categoria === 'saldo'} onClick={() => setCategoria('saldo')}>
                    Top Bitchager
                </button>
                <button type="button" className="rk-aba" aria-pressed={categoria === 'pontos'} onClick={() => setCategoria('pontos')}>
                    Top Pontos
                </button>
            </div>

            {dadosOrdenados.length === 0 && (
                <p className="rk-vazio">
                    <Icone nome="ranking" />
                    <b>Ranking vazio</b>
                    <span>Os jogadores aparecem aqui depois das primeiras partidas.</span>
                </p>
            )}

            {temPodio && <Podio top3={top3} categoria={categoria} meuUid={meuUid} />}

            {resto.length > 0 && (
                <ol className="rk-lista" start={temPodio ? 4 : 1}>
                    {resto.map(jogador => (
                        <LinhaRanking
                            key={jogador.uid}
                            jogador={jogador}
                            categoria={categoria}
                            euSou={jogador.uid === meuUid}
                        />
                    ))}
                </ol>
            )}

            {meuUid && minhaposicao > 9 && (
                <div className="rk-minha">
                    <p className="rk-minha-rot">Sua posição</p>
                    <ol className="rk-lista" start={minhaposicao + 1} style={{ borderTop: 0 }}>
                        <LinhaRanking
                            jogador={dadosOrdenados[minhaposicao]}
                            categoria={categoria}
                            euSou={true}
                        />
                    </ol>
                </div>
            )}

            {ranking.length === 0 && (
                <p className="rk-aviso" role="status">
                    <Icone nome="info" />
                    <span>Dados de exemplo. O ranking real aparece quando o servidor responder.</span>
                </p>
            )}

        </div>
    );
}

function Avatar({ jogador }) {
    const [falhou, setFalhou] = useState(false);
    if (jogador.avatar && !falhou) {
        return <img src={jogador.avatar} alt="" onError={() => setFalhou(true)} />;
    }
    return <Icone nome="perfil" />;
}

// Os 3 primeiros em degraus: 2º, 1º, 3º
function Podio({ top3, categoria, meuUid }) {
    const ordem = [top3[1], top3[0], top3[2]];
    return (
        <ol className="rk-podio" aria-label="Os três primeiros">
            {ordem.map(jogador => {
                const euSou = jogador.uid === meuUid;
                return (
                    <li key={jogador.uid} className={`rk-pd p${jogador.posicao}${euSou ? ' eu' : ''}`} value={jogador.posicao}>
                        <span className="foto"><Avatar jogador={jogador} /></span>
                        <span className="nome" title={jogador.nome}>{jogador.nome.split(' ')[0]}</span>
                        <span className="valor num">{fmtValor(jogador, categoria)}</span>
                        {euSou && <span className="rk-voce">você</span>}
                        <span className="degrau" aria-label={`${jogador.posicao}º lugar`}>{jogador.posicao}</span>
                    </li>
                );
            })}
        </ol>
    );
}

function LinhaRanking({ jogador, categoria, euSou }) {
    return (
        <li className={`rk-lin${euSou ? ' eu' : ''}`} value={jogador.posicao}>
            <span className="pos num">{jogador.posicao}</span>
            <span className="foto"><Avatar jogador={jogador} /></span>
            <span className="nome">
                {jogador.nome}
                {euSou && <span className="rk-voce">você</span>}
            </span>
            <span className="valor num">{fmtValor(jogador, categoria)}</span>
        </li>
    );
}
