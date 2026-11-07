/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalSenha.jsx

   CONCEITO GERAL:
   Modal simples para o jogador digitar a senha de uma mesa privada.
   Aparece quando o jogador clica em "Entrar" em uma mesa com cadeado.

   COMPORTAMENTOS:
     → Foco automático no input ao abrir
     → Enter no teclado confirma a senha, Esc fecha
     → Mostra/esconde a senha
     → Erro inline se tentar confirmar com campo vazio

   Estilos em styles/ranking-admin.css (prefixos jan- e sn-).

   PROPS:
     onConfirmar → function(senha): chamada com a senha digitada
     onFechar    → function(): fecha o modal sem entrar
================================================================ */

import { useState, useEffect, useRef } from 'react';
import Icone from '../../components/Icone';
import '../../styles/ranking-admin.css';


export default function ModalSenha({ onConfirmar, onFechar }) {

    const [senha,        setSenha       ] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [erro,         setErro        ] = useState('');

    const inputRef = useRef(null);

    // Foco automático ao montar
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(t);
    }, []);

    // Esc fecha em qualquer ponto do modal
    useEffect(() => {
        function aoTeclar(e) { if (e.key === 'Escape') onFechar(); }
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [onFechar]);

    function handleConfirmar() {
        if (!senha.trim()) {
            setErro('Digite a senha da mesa.');
            inputRef.current?.focus();
            return;
        }
        onConfirmar(senha.trim());
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') handleConfirmar();
    }

    return (
        <>
            <div onClick={onFechar} className="jan-veu" />

            <div className="jan-pos">
                <div className="jan sn" role="dialog" aria-modal="true" aria-labelledby="titulo-senha">

                    <div className="sn-topo">
                        <span className="sn-selo"><Icone nome="cadeado" /></span>
                        <div>
                            <h2 id="titulo-senha">Mesa privada</h2>
                            <p>Digite a senha para entrar nesta mesa.</p>
                        </div>
                    </div>

                    <div className="jan-campo">
                        <label htmlFor="sn-senha">Senha da mesa</label>
                        <div className={`jan-entrada${erro ? ' com-erro' : ''}`}>
                            <input
                                id="sn-senha"
                                ref={inputRef}
                                type={mostrarSenha ? 'text' : 'password'}
                                value={senha}
                                onChange={e => {
                                    setSenha(e.target.value);
                                    if (erro) setErro('');
                                }}
                                onKeyDown={handleKeyDown}
                                maxLength={20}
                                name="senha-mesa"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={erro ? 'true' : undefined}
                                aria-describedby={erro ? 'sn-erro' : undefined}
                            />
                            <button
                                type="button"
                                className="acao"
                                onClick={() => setMostrarSenha(v => !v)}
                                aria-pressed={mostrarSenha}
                            >
                                {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                        {erro && <p id="sn-erro" className="jan-erro" role="alert">{erro}</p>}
                    </div>

                    <div className="sn-acoes">
                        <button type="button" onClick={onFechar} className="jan-btn neutro">
                            Cancelar
                        </button>
                        <button type="button" onClick={handleConfirmar} className="jan-btn principal">
                            Entrar na mesa
                        </button>
                    </div>

                </div>
            </div>
        </>
    );
}
