// ========================================================
// Aviator Monitor Bot - VERSÃO RAILWAY 24/7 (Hobby Plan)
// Otimizado: delay startup + health check + baixa RAM
// ========================================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 8080;

// CONFIGURAÇÕES - USE VARIÁVEIS DE AMBIENTE NO RAILWAY (NUNCA HARDCODE)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEFONE = process.env.TELEFONE;
const SENHA = process.env.SENHA;
const URL_AVIATOR = process.env.URL_AVIATOR || 'https://m.888bets.co.mz/pt/games/detail/casino/normal/7787';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let browser;
let page;
let historicoAntigo = new Set();
let multiplicadores = [];

// FUNÇÕES AUXILIARES
async function enviarTelegram(mensagem) {
  try {
    await bot.sendMessage(CHAT_ID, mensagem, { parse_mode: 'HTML' });
    console.log('[TELEGRAM] Enviado:', mensagem);
  } catch (err) {
    console.error('[TELEGRAM ERRO]', err.message);
  }
}

async function getIframeFrame() {
  try {
    const iframeElement = await page.waitForSelector('iframe', { timeout: 15000 });
    const frame = await iframeElement.contentFrame();
    if (!frame) throw new Error('ContentFrame não acessível');
    console.log('[IFRAME] Re-pego com sucesso!');
    return frame;
  } catch (err) {
    console.error('[IFRAME ERRO]', err.message);
    return null;
  }
}

// INÍCIO DO BOT
async function iniciarBot() {
  try {
    console.log('[BOT] Iniciando Aviator Monitor com Stealth...');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-accelerated-2d-canvas',
        '--memory-pressure-off',
        '--window-size=1024,768',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      ],
    });

    page = await browser.newPage();
    console.log(`[BOT] Abrindo: ${URL_AVIATOR}`);
    await page.goto(URL_AVIATOR, { waitUntil: 'networkidle2', timeout: 120000 });

    // LOGIN AUTOMÁTICO
    console.log('[LOGIN] Iniciando login automático...');
    await page.waitForSelector('input#phone', { timeout: 90000, visible: true });
    await page.type('input#phone', TELEFONE);
    console.log('[LOGIN] Telefone digitado');

    await page.waitForSelector('input#password', { timeout: 60000, visible: true });
    await page.type('input#password', SENHA);
    console.log('[LOGIN] Senha digitada');

    await page.waitForSelector('button.login-btn', { timeout: 60000, visible: true });
    await page.click('button.login-btn');
    console.log('[LOGIN] Botão de login clicado');

    await page.waitForSelector('iframe', { timeout: 120000 });
    console.log('[LOGIN] Jogo carregando...');

    await new Promise(resolve => setTimeout(resolve, 12000));

    let frame = await getIframeFrame();
    if (!frame) throw new Error('Não conseguiu pegar iframe após login');

    enviarTelegram('🤖 Bot logado na 888bets e monitorando histórico REAL do Aviator! 🔥');

    // LOOP PRINCIPAL
    setInterval(async () => {
      try {
        frame = await getIframeFrame();
        if (!frame) return;

        const payouts = await frame.$$eval(
          '.payouts-block .payout.ng-star-inserted',
          els => els.map(el => el.innerText.trim()).filter(t => t && t.endsWith('x'))
        );

        const novos = [];
        payouts.forEach(texto => {
          const valorStr = texto.replace('x', '').trim().replace(',', '.');
          const valor = parseFloat(valorStr);
          if (!isNaN(valor)) {
            const key = valor.toFixed(2);
            if (!historicoAntigo.has(key)) {
              historicoAntigo.add(key);
              const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
              multiplicadores.push({ timestamp, valor });
              novos.push(valor);

              let msg = `🕒 ${timestamp} | <b>${valor.toFixed(2)}x</b>`;
              if (valor >= 50) {
                msg = `🚀 FOGUETÃO INSANO! ${valor.toFixed(2)}x 🚀\n${msg}`;
              } else if (valor >= 10) {
                msg = `🔥 BOA! ${valor.toFixed(2)}x 🔥\n${msg}`;
              }
              enviarTelegram(msg);
            }
          }
        });

        if (novos.length > 0) {
          console.log(`Novos do histórico: ${novos.map(v => v.toFixed(2)).join(', ')}`);
          fs.writeFileSync('historico.json', JSON.stringify(multiplicadores, null, 2));
        }

      } catch (err) {
        console.error('[ERRO no loop]', err.message);
      }
    }, 8000);

  } catch (err) {
    console.error('[ERRO FATAL]', err.message);
    if (browser) await browser.close();
    process.exit(1); // força restart do Railway
  }
}

// ====================== RAILWAY HEALTH CHECK ======================
app.get('/health', (req, res) => {
  res.status(200).send('✅ Aviator Bot ONLINE - Railway Health Check');
});

app.get('/', (req, res) => {
  res.send(`
    <h1>Aviator Monitor Bot (Railway 24/7)</h1>
    <p>Status: <b>RODANDO</b></p>
    <p>Capturados: ${multiplicadores.length}</p>
    <p>Últimos 5: ${multiplicadores.slice(-5).map(m => m.valor.toFixed(2) + 'x').join(', ')}</p>
  `);
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port} (Railway detectado)`);
  console.log('[RAILWAY] Aguardando 8 segundos para iniciar o bot pesado...');
  
  // DELAY OBRIGATÓRIO pra não dar SIGTERM de RAM
  setTimeout(() => {
    iniciarBot().catch(err => console.error(err));
  }, 8000);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Recebido SIGTERM - Fechando browser...');
  if (browser) await browser.close();
  process.exit(0);
});
