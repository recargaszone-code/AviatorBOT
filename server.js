// ========================================================
// Aviator Monitor Bot - Versão PC Direto (funcionando local)
// Captura SÓ histórico real da .payouts-block
// Login automático + Telegram + Logs simples
// ========================================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÕES
const TELEGRAM_TOKEN = '8583470384:AAF0poQRbfGkmGy7cA604C4b_-MhYj-V7XM';
const CHAT_ID = '7427648935';

const TELEFONE = '863584494';
const SENHA = '0000000000';

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
    '--window-size=1280,800'
  ],
});

    page = await browser.newPage();

    console.log(`[BOT] Abrindo: ${URL_AVIATOR}`);
    await page.goto(URL_AVIATOR, { waitUntil: 'networkidle2', timeout: 90000 });

    // LOGIN AUTOMÁTICO
    console.log('[LOGIN] Iniciando login automático...');

    await page.waitForSelector('input#phone', { timeout: 60000, visible: true });
    await page.type('input#phone', TELEFONE);
    console.log('[LOGIN] Telefone digitado');

    await page.waitForSelector('input#password', { timeout: 30000, visible: true });
    await page.type('input#password', SENHA);
    console.log('[LOGIN] Senha digitada');

    await page.waitForSelector('button.login-btn', { timeout: 30000, visible: true });
    await page.click('button.login-btn');
    console.log('[LOGIN] Botão de login clicado');

    await page.waitForSelector('iframe', { timeout: 90000 });
    console.log('[LOGIN] Jogo carregando...');

    await new Promise(resolve => setTimeout(resolve, 10000)); // Espera estabilizar

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
                console.log(`[${timestamp}] FOGUETÃO: ${valor.toFixed(2)}x`);
              } else if (valor >= 10) {
                msg = `🔥 BOA! ${valor.toFixed(2)}x 🔥\n${msg}`;
                console.log(`[${timestamp}] BOA: ${valor.toFixed(2)}x`);
              } else {
                console.log(`[${timestamp}] Novo histórico: ${valor.toFixed(2)}x`);
              }

              enviarTelegram(msg);
            }
          }
        });

        if (novos.length > 0) {
          console.log(`Novos do histórico: ${novos.map(v => v.toFixed(2)).join(', ')}`);
          fs.writeFileSync('historico.json', JSON.stringify(multiplicadores, null, 2));
          console.log('historico.json atualizado');
        }

      } catch (err) {
        console.error('[ERRO no loop]', err.message);
      }
    }, 8000);

  } catch (err) {
    console.error('[ERRO FATAL]', err.message);
    if (browser) await browser.close();
  }
}

// SERVER PRA TESTE LOCAL (opcional, pode rodar sem isso)
app.get('/', (req, res) => {
  res.send(`
    <h1>Aviator Monitor Bot (PC)</h1>
    <p>Status: Rodando</p>
    <p>Capturados: ${multiplicadores.length}</p>
    <p>Últimos 5: ${multiplicadores.slice(-5).map(m => m.valor.toFixed(2) + 'x').join(', ')}</p>
  `);
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  iniciarBot();
});

process.on('SIGTERM', async () => {
  console.log('Fechando browser...');
  if (browser) await browser.close();
  process.exit(0);

});

