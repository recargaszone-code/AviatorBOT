// ========================================================
// Aviator 888bet - RAILWAY 24/7 (ARRAY ROLANTE NO TELEGRAM + API ENDPOINT)
// ========================================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 8080;

// CONFIGURAÇÕES
const TELEGRAM_TOKEN = "8583470384:AAF0poQRbfGkmGy7cA604C4b_-MhYj-V7XM";
const CHAT_ID = "7427648935";
const TELEFONE = "863584494";
const SENHA = "0000000000";
const URL_AVIATOR = 'https://m.888bets.co.mz/pt/games/detail/casino/normal/7787';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let browser;
let page;
let historicoAntigo = new Set();
let historicoAtual = [];        // ← ARRAY QUE VOCÊ PEDIU
const MAX_HISTORICO = 40;       // últimos 20 multiplicadores (pode mudar)

let multiplicadores = [];

// FUNÇÕES AUXILIARES
async function enviarTelegram(mensagem) {
  try {
    await bot.sendMessage(CHAT_ID, mensagem, { parse_mode: 'HTML' });
    console.log('[TELEGRAM] Enviado');
  } catch (err) {
    console.error('[TELEGRAM ERRO]', err.message);
  }
}

async function enviarScreenshot(caption = '📸 Screenshot') {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' });
    await bot.sendPhoto(CHAT_ID, Buffer.from(screenshot, 'base64'), { caption });
  } catch (e) {}
}

async function getIframeFrame() {
  try {
    const iframeElement = await page.waitForSelector('iframe', { timeout: 30000 });
    const frame = await iframeElement.contentFrame();
    console.log('[IFRAME] Re-pego!');
    return frame;
  } catch (err) {
    console.error('[IFRAME ERRO]', err.message);
    return null;
  }
}

// INÍCIO DO BOT
async function iniciarBot() {
  try {
    console.log('[BOT] Iniciando Aviator Monitor...');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--no-zygote', '--single-process', '--window-size=1024,768',
        '--user-agent=Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    await page.goto(URL_AVIATOR, { waitUntil: 'networkidle0', timeout: 180000 });
    await enviarScreenshot('📸 Página inicial carregada');

    // LOGIN COM RETRY
    console.log('[LOGIN] Iniciando...');
    let tentativas = 0;
    const maxTentativas = 2;

    while (tentativas < maxTentativas) {
      try {
        await page.waitForSelector('input#phone', { timeout: 180000, visible: true });
        await page.type('input#phone', TELEFONE);

        await page.waitForSelector('input#password', { timeout: 120000, visible: true });
        await page.type('input#password', SENHA);

        await page.waitForSelector('button.login-btn', { timeout: 120000, visible: true });
        await page.click('button.login-btn');

        await page.waitForSelector('iframe', { timeout: 180000 });
        await new Promise(r => setTimeout(r, 15000));

        const frame = await getIframeFrame();
        if (!frame) throw new Error('Iframe não encontrado');

        enviarTelegram('🤖 Bot logado na 888bets e monitorando histórico REAL! 🔥');
        break;
      } catch (e) {
        tentativas++;
        await enviarScreenshot(`❌ Falha login (tentativa ${tentativas})`);
        if (tentativas >= maxTentativas) throw e;
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // LOOP PRINCIPAL - ARRAY ROLANTE
    setInterval(async () => {
      try {
        const frame = await getIframeFrame();
        if (!frame) return;

        const payouts = await frame.$$eval(
          '.payouts-block .payout.ng-star-inserted',
          els => els.map(el => el.innerText.trim()).filter(t => t && t.endsWith('x'))
        );

        let atualizou = false;

        payouts.forEach(texto => {
          const valorStr = texto.replace('x', '').trim().replace(',', '.');
          const valor = parseFloat(valorStr);
          if (isNaN(valor)) return;

          const key = valor.toFixed(2);
          if (!historicoAntigo.has(key)) {
            historicoAntigo.add(key);
            multiplicadores.push({ timestamp: new Date().toISOString().slice(0,19), valor });

            // ATUALIZA O ARRAY ROLANTE
            historicoAtual.unshift(valor.toFixed(2));   // novo no começo
            if (historicoAtual.length > MAX_HISTORICO) {
              historicoAtual.pop();                     // remove o mais antigo
            }

            atualizou = true;
          }
        });

        // NÃO MANDA PRO TELEGRAM, SÓ SALVA PRO ENDPOINT
        if (atualizou) {
          fs.writeFileSync('historico.json', JSON.stringify(multiplicadores, null, 2));
          console.log(`[ARRAY] Atualizado → ${historicoAtual.length} itens`);
        }

      } catch (err) {
        console.error('[ERRO no loop]', err.message);
      }
    }, 8000);

  } catch (err) {
    console.error('[ERRO FATAL]', err.message);
    await enviarScreenshot('💥 ERRO FATAL');
    if (browser) await browser.close();
    process.exit(1);
  }
}

// HEALTH CHECK + ENDPOINT HISTÓRICO
app.get('/health', (req, res) => res.status(200).send('✅ ONLINE'));

app.get('/historico', (req, res) => {
  res.json({ historicoAtual });  // ← RETORNA O ARRAY COMO JSON
});

app.get('/', (req, res) => {
  res.send(`<h1>888bet Array Monitor</h1><p>Histórico atual: <code>${JSON.stringify(historicoAtual)}</code></p>`);
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  setTimeout(() => iniciarBot().catch(console.error), 10000);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Fechando...');
  if (browser) await browser.close();
  process.exit(0);
});
