// ========================================================
// Aviator 888bet - RENDER 24/7 (ARRAY ROLANTE + ENDPOINT)
// Versão corrigida 2026 - otimizada pra free tier
// ========================================================
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 8080;

// CONFIGS
const TELEGRAM_TOKEN = "8583470384:AAF0poQRbfGkmGy7cA604C4b_-MhYj-V7XM";
const CHAT_ID = "7427648935";
const TELEFONE = "863584494";
const SENHA = "0000000000";
const URL_AVIATOR = 'https://m.888bets.co.mz/pt/games/detail/casino/normal/7787';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let browser;
let page;
let historicoAntigo = new Set();
let historicoAtual = []; // ARRAY ROLANTE
const MAX_HISTORICO = 40;
let multiplicadores = [];

// DEBUG INICIAL (pra ver se chega aqui)
console.log('[DEBUG] Arquivo server.js carregado com sucesso');
console.log('[DEBUG] Dependências importadas');

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
    console.log('[SCREENSHOT] Enviado:', caption);
  } catch (e) {
    console.error('[SCREENSHOT ERRO]', e.message);
  }
}

async function getIframeFrame() {
  try {
    const iframeElement = await page.waitForSelector('iframe', { timeout: 60000 });
    const frame = await iframeElement.contentFrame();
    console.log('[IFRAME] Re-pego com sucesso');
    return frame;
  } catch (err) {
    console.error('[IFRAME ERRO]', err.message);
    return null;
  }
}

// INÍCIO DO BOT
async function iniciarBot() {
  try {
    console.log('[DEBUG] Entrando em iniciarBot');
    await enviarTelegram('🤖 Bot iniciado no Render! Tentando abrir browser...');

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--window-size=1024,768',
        '--user-agent=Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      ],
      ignoreHTTPSErrors: true,
      pipe: true,
      timeout: 90000
    });

    console.log('[DEBUG] Browser lançado com sucesso');
    await enviarTelegram('✅ Browser aberto! Indo pra página...');

    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    await page.goto(URL_AVIATOR, { waitUntil: 'networkidle0', timeout: 180000 });
    await enviarScreenshot('📸 Página inicial carregada');

    // LOGIN COM RETRY
    console.log('[LOGIN] Iniciando...');
    let tentativas = 0;
    const maxTentativas = 3;
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
        await enviarTelegram('🤖 Bot logado na 888bets e monitorando histórico REAL! 🔥');
        break;
      } catch (e) {
        tentativas++;
        await enviarScreenshot(`❌ Falha login (tentativa ${tentativas}/${maxTentativas})`);
        console.error('[LOGIN FALHA]', e.message);
        if (tentativas >= maxTentativas) throw e;
        await new Promise(r => setTimeout(r, 15000));
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
            historicoAtual.unshift(valor.toFixed(2));
            if (historicoAtual.length > MAX_HISTORICO) historicoAtual.pop();
            atualizou = true;
          }
        });

        if (atualizou) {
          fs.writeFileSync('historico.json', JSON.stringify(multiplicadores, null, 2));
          console.log(`[ARRAY] Atualizado → ${historicoAtual.length} itens`);
          await enviarTelegram(`🔄 Histórico atualizado: ${historicoAtual.slice(0,5).join('x → ')}x ...`);
        }
      } catch (err) {
        console.error('[ERRO no loop]', err.message);
      }
    }, 8000);

  } catch (err) {
    console.error('[FATAL CRASH]', err.message, err.stack);
    await enviarTelegram(`💥 CRASH FATAL NO RENDER: ${err.message}\nStack: ${err.stack?.slice(0,500)}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// ENDPOINTS
app.get('/health', (req, res) => res.status(200).send('✅ ONLINE'));
app.get('/historico', (req, res) => res.json({ historicoAtual }));
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
