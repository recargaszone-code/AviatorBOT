// ========================================================
// Aviator Monitor Bot - VERSÃO RAILWAY 24/7 (FINAL)
// Screenshot de debug + retry login + timeouts altos
// ========================================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 8080;

// CONFIGURAÇÕES (USE VARIÁVEIS DE AMBIENTE NO RAILWAY)
const TELEGRAM_TOKEN = "8583470384:AAF0poQRbfGkmGy7cA604C4b_-MhYj-V7XM";
const CHAT_ID = "7427648935";
const TELEFONE = "863584494";
const SENHA = "0000000000";
const URL_AVIATOR = 'https://m.888bets.co.mz/pt/games/detail/casino/normal/7787';

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

async function enviarScreenshot(caption = '📸 Screenshot') {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' });
    await bot.sendPhoto(CHAT_ID, Buffer.from(screenshot, 'base64'), { caption });
    console.log('[DEBUG] Screenshot enviado no Telegram');
  } catch (e) {
    console.error('[SCREENSHOT ERRO]', e.message);
  }
}

async function getIframeFrame() {
  try {
    const iframeElement = await page.waitForSelector('iframe', { timeout: 30000 });
    const frame = await iframeElement.contentFrame();
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
        '--user-agent=Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    console.log(`[BOT] Abrindo: ${URL_AVIATOR}`);
    await page.goto(URL_AVIATOR, { waitUntil: 'networkidle0', timeout: 180000 });

    // DEBUG: screenshot inicial
    await enviarScreenshot('📸 Página inicial carregada');

    // LOGIN AUTOMÁTICO COM RETRY
    console.log('[LOGIN] Iniciando login automático...');
    let loginTentativas = 0;
    const maxTentativas = 2;

    while (loginTentativas < maxTentativas) {
      try {
        await page.waitForSelector('input#phone', { timeout: 180000, visible: true });
        await page.type('input#phone', TELEFONE);
        console.log('[LOGIN] Telefone digitado');

        await page.waitForSelector('input#password', { timeout: 120000, visible: true });
        await page.type('input#password', SENHA);
        console.log('[LOGIN] Senha digitada');

        await page.waitForSelector('button.login-btn', { timeout: 120000, visible: true });
        await page.click('button.login-btn');
        console.log('[LOGIN] Botão clicado');

        await page.waitForSelector('iframe', { timeout: 180000 });
        console.log('[LOGIN] Jogo carregando...');

        await new Promise(r => setTimeout(r, 15000));

        const frame = await getIframeFrame();
        if (!frame) throw new Error('Iframe não encontrado');

        enviarTelegram('🤖 Bot logado na 888bets e monitorando histórico REAL do Aviator! 🔥');
        break; // sucesso

      } catch (loginErr) {
        loginTentativas++;
        console.error(`[LOGIN] Tentativa ${loginTentativas} falhou:`, loginErr.message);
        await enviarScreenshot(`❌ DEBUG - Falha no login (tentativa ${loginTentativas})`);

        if (loginTentativas >= maxTentativas) throw loginErr;
        await new Promise(r => setTimeout(r, 10000)); // espera e tenta de novo
      }
    }

    // LOOP PRINCIPAL
    setInterval(async () => {
      try {
        const frame = await getIframeFrame();
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
              if (valor >= 50) msg = `🚀 FOGUETÃO INSANO! ${valor.toFixed(2)}x 🚀\n${msg}`;
              else if (valor >= 10) msg = `🔥 BOA! ${valor.toFixed(2)}x 🔥\n${msg}`;

              enviarTelegram(msg);
            }
          }
        });

        if (novos.length > 0) {
          fs.writeFileSync('historico.json', JSON.stringify(multiplicadores, null, 2));
        }

      } catch (err) {
        console.error('[ERRO no loop]', err.message);
      }
    }, 8000);

  } catch (err) {
    console.error('[ERRO FATAL]', err.message);
    await enviarScreenshot('💥 ERRO FATAL - Screenshot final');
    if (browser) await browser.close();
    process.exit(1);
  }
}

// ====================== HEALTH CHECK ======================
app.get('/health', (req, res) => res.status(200).send('✅ ONLINE'));
app.get('/', (req, res) => {
  res.send(`<h1>Aviator Bot Railway</h1><p>Capturados: ${multiplicadores.length}</p>`);
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log('[RAILWAY] Aguardando 10 segundos para iniciar o bot...');
  setTimeout(() => iniciarBot().catch(console.error), 10000);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - Fechando...');
  if (browser) await browser.close();
  process.exit(0);
});

