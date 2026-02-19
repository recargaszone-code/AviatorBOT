// ========================================================
// Aviator Multi-Site Monitor - 888bet + PremierBet + Betway (Railway 24/7)
// Versão LIMPA - Sem duplicata de 'app'
// ========================================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();  // ← SÓ UMA VEZ AQUI
const port = process.env.PORT || 8080;

// ====================== CONFIGURAÇÕES DOS 3 SITES ======================
const SITES = [
  {
    nome: "888bet",
    url: "https://m.888bets.co.mz/pt/games/detail/casino/normal/7787",
    telefone: process.env.TELEFONE_888 || "863584494",
    senha: process.env.SENHA_888 || "0000000000",
    phoneSelector: 'input#phone',
    passSelector: 'input#password',
    buttonSelector: 'button.login-btn',
    payoutSelector: '.payouts-block .payout.ng-star-inserted'
  },
  {
    nome: "PremierBet",
    url: "https://www.premierbet.co.mz/virtuals/game/aviator-291195",
    telefone: process.env.TELEFONE || "857789345",
    senha: process.env.SENHA || "max123ZICO",
    phoneSelector: 'input[type="tel"], input[placeholder*="digite"], input[name*="phone"], input#phone',
    passSelector: 'input[type="password"]',
    buttonSelector: '//button[contains(text(), "Iniciar Sessão")]',
    payoutSelector: '.payout, [class*="payout"], [class*="multiplier"], .history-item, .bet-history-item'
  },
  {
    nome: "Betway",
    url: "https://www.betway.co.mz/lobby/instant%20games/game/aviator?vertical=instantgames",
    telefone: process.env.TELEFONE || "857789345",
    senha: process.env.SENHA || "max123ZICO",
    phoneSelector: 'input[type="tel"], input[placeholder*="digite"], input[name*="phone"], input#phone',
    passSelector: 'input[type="password"]',
    buttonSelector: '//button[contains(text(), "Entrar")]',
    payoutSelector: '.payout, [class*="payout"], [class*="multiplier"], .history-item, .bet-history-item'
  }
];

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let browsers = [];
global.historicoAntigo = new Set();

// ====================== FUNÇÕES ======================
async function enviarTelegram(msg, site) {
  const texto = `🟢 <b>[${site}]</b> ${msg}`;
  try {
    await bot.sendMessage(CHAT_ID, texto, { parse_mode: 'HTML' });
  } catch (e) {}
}

async function iniciarSite(siteConfig) {
  const { nome, url, telefone, senha, phoneSelector, passSelector, buttonSelector, payoutSelector } = siteConfig;

  console.log(`[${nome}] 🚀 Iniciando...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process', '--window-size=1024,768']
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 });

  console.log(`[${nome}] Fazendo login...`);
  await page.waitForSelector(phoneSelector, { timeout: 180000 });
  await page.type(phoneSelector, telefone);

  await page.waitForSelector(passSelector, { timeout: 120000 });
  await page.type(passSelector, senha);

  if (buttonSelector.startsWith('//')) {
    const [btn] = await page.$x(buttonSelector);
    if (btn) await btn.click();
  } else {
    await page.click(buttonSelector);
  }

  await new Promise(r => setTimeout(r, 15000));

  // LOOP DO HISTÓRICO
  setInterval(async () => {
    try {
      const payouts = await page.$$eval(payoutSelector, els => 
        els.map(el => el.innerText.trim()).filter(t => t && t.endsWith('x'))
      );

      payouts.forEach(texto => {
        const valor = parseFloat(texto.replace('x','').replace(',','.'));
        if (!isNaN(valor)) {
          const key = `${nome}-${valor.toFixed(2)}`;
          if (!global.historicoAntigo.has(key)) {
            global.historicoAntigo.add(key);
            const timestamp = new Date().toISOString().slice(11,19);
            let msg = `🕒 ${timestamp} | <b>${valor.toFixed(2)}x</b>`;
            if (valor >= 50) msg = `🚀 FOGUETÃO INSANO! ${valor.toFixed(2)}x 🚀\n${msg}`;
            else if (valor >= 10) msg = `🔥 BOA! ${valor.toFixed(2)}x 🔥\n${msg}`;
            enviarTelegram(msg, nome);
          }
        }
      });
    } catch (e) {}
  }, 7000);

  browsers.push(browser);
  enviarTelegram('🤖 Monitor INICIADO e rodando 24/7!', nome);
}

// ====================== RAILWAY START ======================
app.get('/health', (req, res) => res.send('✅ Multi-Aviator ONLINE'));
app.get('/', (req, res) => res.send('<h1>Aviator Multi-Site Rodando no Railway</h1>'));

app.listen(port, async () => {
  console.log(`🚀 Railway Multi-Site Aviator rodando na porta ${port}`);
  for (const site of SITES) {
    iniciarSite(site).catch(err => console.error(`[${site.nome}] ERRO FATAL:`, err.message));
  }
});

process.on('SIGTERM', async () => {
  for (const b of browsers) await b.close();
  process.exit(0);
});
