/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/index.jsx

   MUDANÇAS DESTA VERSÃO:
     → Adicionada etapa 'criarPin' no fluxo de cadastro
     → Após cadastro bem-sucedido, exibe CriarPin antes do Lobby
     → Login continua igual — jogador que já tem conta não vê o PIN aqui

   CONCEITO GERAL:
   Página de autenticação — decide qual tela mostrar:
     → Login    : jogador já tem conta
     → Cadastro : jogador quer criar conta
     → CriarPin : etapa obrigatória após novo cadastro

   FLUXO:
   1. App.jsx renderiza Auth quando não há usuário logado
   2. Auth mostra Login por padrão
   3. Jogador pode alternar para Cadastro e vice-versa
   4. Após cadastro com sucesso → mostra CriarPin
   5. Após criar PIN → App.jsx recebe o usuário e mostra o Lobby

   PROPS:
     onAutenticado → function(usuario): chamada após login/cadastro+PIN
     socket        → Socket.io: necessário para salvar o PIN no backend
================================================================ */

import { useState } from 'react';
import Login    from './Login';
import Cadastro from './Cadastro';
import CriarPin from './CriarPin';
import FichaBTC from '../../components/FichaBTC';


export default function Auth({ onAutenticado, socket, usuarioSemPin = null }) {

    // Controla qual tela mostrar: 'login' | 'cadastro' | 'criarPin'
    const [tela, setTela] = useState(usuarioSemPin ? 'criarPin' : 'login');

    // Guarda o usuário recém-cadastrado enquanto cria o PIN
    const [usuarioPendente, setUsuarioPendente] = useState(usuarioSemPin);


    // ----------------------------------------------------------------
    // Chamado pelo Cadastro após conta criada com sucesso.
    // Guarda o usuário e avança para a etapa de criação de PIN.
    // ----------------------------------------------------------------
    function handleCadastrado(usuario) {
        setUsuarioPendente(usuario);
        setTela('criarPin');
    }


    // ----------------------------------------------------------------
    // Chamado pelo CriarPin após PIN salvo com sucesso.
    // Agora sim o jogador entra no Lobby.
    // ----------------------------------------------------------------
    function handlePinCriado() {
        onAutenticado({ ...usuarioPendente, temPin: true });
        setUsuarioPendente(null);
    }


    return (
        <div className="auth">

            {/* ---- Marca (painel de feltro no desktop, faixa no celular) ---- */}
            <aside className="auth-marca" aria-label="BTC Poker Club">
                <div className="marca" translate="no">
                    <span className="marca-selo num" aria-hidden="true">₿C</span>
                    <span className="marca-nome">BTC Poker Club</span>
                </div>
                <p className="auth-lema">Poker online com ₿C. Mesas ao vivo, torneios e PIX na carteira.</p>
                <FichaBTC className="auth-ficha" />
            </aside>

            <main className="auth-conteudo">

                {/* Etapas do cadastro (só na criação do PIN) */}
                {tela === 'criarPin' && (
                    <ol className="auth-etapas" aria-label="Etapas do cadastro">
                        <Etapa numero={1} label="Conta" concluida />
                        <Etapa numero={2} label="PIN"   ativa />
                        <Etapa numero={3} label="Jogar" />
                    </ol>
                )}

                <div className="auth-cartao">
                    {tela === 'login' && (
                        <Login
                            onAutenticado={onAutenticado}
                            onIrParaCadastro={() => setTela('cadastro')}
                        />
                    )}

                    {tela === 'cadastro' && (
                        <Cadastro
                            onAutenticado={handleCadastrado}
                            onLoginExistente={onAutenticado}
                            onIrParaLogin={() => setTela('login')}
                        />
                    )}

                    {tela === 'criarPin' && (
                        <CriarPin
                            usuario={usuarioPendente}
                            socket={socket}
                            onConcluido={handlePinCriado}
                        />
                    )}
                </div>

                <p className="auth-rodape">
                    Ao continuar você concorda com os <span className="auth-link-fraco">Termos de Uso</span>.
                </p>
            </main>
        </div>
    );
}


function Etapa({ numero, label, concluida, ativa }) {
    return (
        <li className={`auth-etapa${concluida ? ' feita' : ''}${ativa ? ' ativa' : ''}`} aria-current={ativa ? 'step' : undefined}>
            <span className="n num" aria-hidden="true">{concluida ? '✓' : numero}</span>
            <span className="r">{label}</span>
        </li>
    );
}
