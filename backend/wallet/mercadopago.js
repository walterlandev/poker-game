/* ================================================================
   ARQUIVO: backend/wallet/mercadopago.js

   CONCEITO GERAL:
   Integração com o Mercado Pago para:
     → Criar preferência de pagamento PIX
     → Criar preferência de pagamento com cartão
     → Receber e validar webhook de confirmação
     → Chamar creditarDeposito() após confirmação real

   FLUXO COMPLETO DE DEPÓSITO:
     1. Frontend emite 'wallet:depositar' com valorBRL + PIN
     2. server.js chama criarPagamentoPIX()
     3. Mercado Pago retorna qrCode + pixCopiaECola
     4. Frontend exibe QR Code para o jogador escanear
     5. Jogador paga no app do banco
     6. Mercado Pago chama nosso webhook POST /webhook/mercadopago
     7. Webhook valida a assinatura + status 'approved'
     8. Webhook chama creditarDeposito() que credita os ₿C
     9. Socket emite 'wallet:saldo_atualizado' para o jogador

   VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
     MP_ACCESS_TOKEN   → token privado da conta MP (não expor!)
     MP_WEBHOOK_SECRET → chave para validar webhooks
     CLIENT_URL        → URL do frontend (para redirect após pagamento)

   DOCUMENTAÇÃO:
     https://www.mercadopago.com.br/developers/pt/docs
================================================================ */

import crypto from 'crypto';
import { creditarDeposito } from './wallet-manager.js';
import { assinaturaWebhookValida } from './assinatura-mp.js';
import admin from 'firebase-admin';


// ================================================================
// BLOCO 1: CONFIGURAÇÃO
// ================================================================

const MP_ACCESS_TOKEN   = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const CLIENT_URL        = process.env.CLIENT_URL || 'http://localhost:5173';
const MP_API_BASE       = 'https://api.mercadopago.com';

// Em produção (token real configurado) o segredo do webhook é obrigatório —
// sem ele, a validação de assinatura era pulada SILENCIOSAMENTE, permitindo
// que qualquer um chamasse o endpoint do webhook fingindo ser o Mercado
// Pago e mandasse creditar depósitos à vontade. Em modo dev (sem token
// real) não há dinheiro de verdade envolvido, então não bloqueia.
const MODO_DEV = !MP_ACCESS_TOKEN;


// ================================================================
// BLOCO 2: CRIAR PAGAMENTO PIX
//
// Cria uma cobrança PIX no Mercado Pago.
// Retorna o QR Code e o Pix Copia e Cola para o frontend exibir.
//
// O campo external_reference é o intencaoId salvo no Firestore.
// Quando o webhook chegar, usamos ele para identificar o depósito.
// ================================================================

export async function criarPagamentoPIX({ intencaoId, valorBRL, totalBRL, uid, nomeJogador }) {
    if (!MP_ACCESS_TOKEN) {
        console.warn('⚠️  MP_ACCESS_TOKEN não configurado. Simulando pagamento.');
        return simularPagamentoPIX(intencaoId, totalBRL);
    }

    try {
        const body = {
            transaction_amount: parseFloat(totalBRL.toFixed(2)),
            description:        `Depósito ₿C Bitchager Poker`,
            payment_method_id:  'pix',
            external_reference: intencaoId,   // nosso ID para identificar no webhook
            payer: {
                email: `${uid}@bitchager.poker`, // email fictício por uid
                first_name: nomeJogador || 'Jogador',
            },
            notification_url: `${process.env.SERVER_URL || 'https://seu-backend.railway.app'}/webhook/mercadopago`,
        };

        const res = await fetch(`${MP_API_BASE}/v1/payments`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                // Idempotência: evita cobrar duas vezes se a requisição cair
                'X-Idempotency-Key': intencaoId,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.message || `MP retornou ${res.status}`);
        }

        const data = await res.json();

        return {
            sucesso:         true,
            pagamentoId:     String(data.id),
            status:          data.status,
            qrCode:          data.point_of_interaction?.transaction_data?.qr_code_base64 || null,
            pixCopiaECola:   data.point_of_interaction?.transaction_data?.qr_code        || null,
            expiracaoEm:     data.date_of_expiration || null,
        };

    } catch (e) {
        console.error('Erro ao criar pagamento PIX:', e.message);
        return { sucesso: false, erro: e.message };
    }
}


// ================================================================
// BLOCO 2B: ENVIAR PIX DE SAÍDA (SAQUE)
//
// Chamada por wallet-manager.js (wallet:sacar) quando MP_ACCESS_TOKEN
// está configurado (produção). Em DEV, o saque é simulado direto no
// wallet-manager.js (confirmarSaque após 3s) — esta função não é
// chamada nesse modo.
//
// ⚠️  AINDA NÃO INTEGRADO COM A API REAL DO MERCADO PAGO.
// Diferente do PIX de entrada (criarPagamentoPIX acima, que usa o
// endpoint padrão /v1/payments), enviar PIX de saída pela conta MP
// normalmente passa pelo produto "Dinheiro na conta"/transferências,
// que costuma exigir aprovação adicional na conta e uma verificação
// cuidadosa do schema atual da API antes de implementar — não é uma
// chamada simétrica ao recebimento. Por isso, por enquanto, isto só
// registra a intenção e devolve erro — o saque fica PENDENTE no
// Firestore (coleção saques_pendentes) pra processamento manual até
// essa integração real ser feita.
// ================================================================

export async function enviarPIXSaida({ saqueId, valorBC, brlLiquido, chavePix, uid, nomeJogador }) {
    if (!MP_ACCESS_TOKEN) {
        return { sucesso: false, erro: 'MP_ACCESS_TOKEN não configurado.' };
    }

    // TODO: chamar aqui o endpoint real de PIX de saída do Mercado Pago
    // (confirmar o schema atual na documentação antes de implementar —
    // não usar o endpoint /v1/payments, que é só para recebimento).
    console.warn(`⚠️  PIX de saída não implementado — saque ${saqueId} (uid ${uid}, ₿C ${valorBC} → R$ ${brlLiquido}, chave ${chavePix}) ficou pendente para processamento manual.`);

    void nomeJogador;
    return {
        sucesso: false,
        erro:    'Envio automático de PIX ainda não integrado. Saque registrado como pendente.',
    };
}


// ================================================================
// BLOCO 3: CRIAR PAGAMENTO COM CARTÃO
//
// Cria uma preferência de checkout para pagamento com cartão.
// O frontend redireciona o jogador para a URL do MP.
// Após pagar, MP redireciona de volta para CLIENT_URL.
// ================================================================

export async function criarPreferenciaCartao({ intencaoId, valorBRL, totalBRL, uid, nomeJogador }) {
    if (!MP_ACCESS_TOKEN) {
        console.warn('⚠️  MP_ACCESS_TOKEN não configurado. Simulando pagamento.');
        return { sucesso: true, checkoutUrl: `${CLIENT_URL}?deposito=simulado&id=${intencaoId}` };
    }

    try {
        const body = {
            items: [{
                id:          intencaoId,
                title:       'Depósito ₿C Bitchager Poker',
                description: `Depósito de R$ ${valorBRL.toFixed(2)} = ₿C ${Math.floor(valorBRL * 1000).toLocaleString('pt-BR')}`,
                quantity:    1,
                currency_id: 'BRL',
                unit_price:  parseFloat(totalBRL.toFixed(2)),
            }],
            external_reference:  intencaoId,
            notification_url:    `${process.env.SERVER_URL || 'https://seu-backend.railway.app'}/webhook/mercadopago`,
            back_urls: {
                success: `${CLIENT_URL}?deposito=sucesso`,
                failure: `${CLIENT_URL}?deposito=falha`,
                pending: `${CLIENT_URL}?deposito=pendente`,
            },
            auto_return: 'approved',
            payer: {
                name:  nomeJogador || 'Jogador',
                email: `${uid}@bitchager.poker`,
            },
        };

        const res = await fetch(`${MP_API_BASE}/checkout/preferences`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.message || `MP retornou ${res.status}`);
        }

        const data = await res.json();

        return {
            sucesso:      true,
            preferenceId: data.id,
            checkoutUrl:  data.init_point,       // produção
            sandboxUrl:   data.sandbox_init_point, // testes
        };

    } catch (e) {
        console.error('Erro ao criar preferência cartão:', e.message);
        return { sucesso: false, erro: e.message };
    }
}


// ================================================================
// BLOCO 4: PROCESSAR WEBHOOK
//
// O Mercado Pago chama POST /webhook/mercadopago quando um
// pagamento muda de status.
//
// VALIDAÇÃO DA ASSINATURA:
//   MP envia uma assinatura no header x-signature.
//   Calculamos o HMAC-SHA256 do body com MP_WEBHOOK_SECRET.
//   Se não bater → rejeitamos (pode ser ataque).
//
// Esta função é registrada no Express em server.js assim:
//   app.post('/webhook/mercadopago', processarWebhookMP(io))
// ================================================================

export function processarWebhookMP(io) {
    return async (req, res) => {
        try {
            // Responde 200 imediatamente — MP não espera processamento longo
            res.status(200).send('OK');

            const { type, data } = req.body;

            // Só processa notificações de pagamento
            if (type !== 'payment') return;

            const pagamentoId = data?.id;
            if (!pagamentoId) return;

            // Valida assinatura do webhook (segurança)
            if (!MODO_DEV && !MP_WEBHOOK_SECRET) {
                console.error('🚨 MP_WEBHOOK_SECRET ausente em produção — webhook rejeitado por segurança.');
                return;
            }
            if (MP_WEBHOOK_SECRET) {
                const assinaturaValida = assinaturaWebhookValida({
                    secret:     MP_WEBHOOK_SECRET,
                    xSignature: req.headers['x-signature'],
                    xRequestId: req.headers['x-request-id'],
                    dataId:     req.query?.['data.id'] ?? pagamentoId,
                });
                if (!assinaturaValida) {
                    // A reconciliação (reconciliarDepositosPendentes) ainda
                    // confere esse pagamento direto na API em até 2 min.
                    console.warn(`⚠️  Webhook com assinatura inválida rejeitado (pagamento ${pagamentoId}). Confira MP_WEBHOOK_SECRET.`);
                    return;
                }
            }

            // Busca detalhes do pagamento na API do MP
            const pagamento = await buscarPagamento(pagamentoId);
            if (!pagamento) return;

            console.log(`📩 Webhook MP: pagamento ${pagamentoId} → status: ${pagamento.status}`);

            // Só processa pagamentos aprovados
            if (pagamento.status !== 'approved') return;

            // external_reference é o intencaoId que salvamos no Firestore
            const intencaoId = pagamento.external_reference;
            if (!intencaoId) {
                console.error('Webhook sem external_reference:', pagamentoId);
                return;
            }

            // Credita os ₿C na carteira do jogador
            await creditarDeposito(intencaoId, io);

        } catch (e) {
            console.error('Erro no webhook MP:', e.message);
        }
    };
}


// ================================================================
// BLOCO 5: HELPERS INTERNOS
// ================================================================

/**
 * Busca os detalhes de um pagamento na API do Mercado Pago.
 */
async function buscarPagamento(pagamentoId) {
    if (!MP_ACCESS_TOKEN) return null;

    try {
        const res = await fetch(`${MP_API_BASE}/v1/payments/${pagamentoId}`, {
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
        });

        if (!res.ok) return null;
        return await res.json();

    } catch (e) {
        console.error('Erro ao buscar pagamento MP:', e.message);
        return null;
    }
}

/**
 * Simula pagamento PIX em desenvolvimento (quando MP não está configurado).
 * Em produção, esta função nunca é chamada.
 */
function simularPagamentoPIX(intencaoId, totalBRL) {
    return {
        sucesso:       true,
        pagamentoId:   `sim_${intencaoId}`,
        status:        'pending',
        qrCode:        null, // sem QR Code em simulação
        pixCopiaECola: `00020126580014br.gov.bcb.pix0136${intencaoId}5204000053039865802BR5913Bitchager6009SAO PAULO62070503***6304SIMULADO`,
        expiracaoEm:   new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        simulado:      true,
    };
}

// ================================================================
// RECONCILIAÇÃO DE DEPÓSITOS (rede de segurança do webhook)
// A cada 2 min o servidor pergunta à API do Mercado Pago sobre os
// depósitos ainda PENDENTES das últimas 48 h. Aprovado → credita com
// creditarDeposito (idempotente: nunca credita duas vezes). Vencido ou
// cancelado → marca EXPIRADO. Assim um webhook perdido, recusado ou mal
// configurado não deixa mais PIX pago sem crédito.
// ================================================================
const JANELA_RECONCILIACAO_MS = 48 * 60 * 60 * 1000;

export async function reconciliarDepositosPendentes(io) {
    if (MODO_DEV) return;
    try {
        const db   = admin.firestore();
        const snap = await db.collection('depositos_pendentes').where('status', '==', 'PENDENTE').get();
        const agora = Date.now();
        for (const doc of snap.docs) {
            const d = doc.data();
            const criadoMs = d.criadoEm?.toMillis?.() || 0;
            if (!d.pagamentoId || !criadoMs || agora - criadoMs > JANELA_RECONCILIACAO_MS) continue;

            const pagamento = await buscarPagamento(d.pagamentoId);
            if (!pagamento || pagamento.external_reference !== doc.id) continue;

            if (pagamento.status === 'approved') {
                console.log(`🔁 Reconciliação: pagamento ${d.pagamentoId} aprovado sem webhook — creditando ${doc.id}`);
                await creditarDeposito(doc.id, io);
            } else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(pagamento.status)) {
                await doc.ref.update({ status: 'EXPIRADO', statusMP: pagamento.status });
            }
        }
    } catch (e) {
        console.error('Erro na reconciliação de depósitos:', e.message);
    }
}
